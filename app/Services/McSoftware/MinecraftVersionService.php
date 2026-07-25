<?php

namespace Pterodactyl\Services\McSoftware;

use Carbon\Carbon;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Fetches live version/build listings for supported Minecraft server
 * software from each project's official upstream API. Results are cached
 * briefly since these endpoints are relatively slow-moving and we don't
 * want every panel page load to hammer upstream services.
 */
class MinecraftVersionService
{
    protected const CACHE_TTL_MINUTES = 15;

    protected const USER_AGENT = 'Pterodactyl-VersionSelector/1.0 (+https://github.com/YeahAkis/NotionTheme)';

    /**
     * Returns a flat, newest-first list of Minecraft game versions (releases only)
     * known to Mojang. Used for Vanilla, and as the base list for loader-based
     * software which then filters to versions it has builds for.
     *
     * @return string[]
     */
    public function vanillaVersions(): array
    {
        return Cache::remember('mc_software:vanilla', now()->addMinutes(self::CACHE_TTL_MINUTES), function () {
            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(10)
                    ->get('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');

                if (!$response->successful()) {
                    return [];
                }

                return collect($response->json('versions', []))
                    ->where('type', 'release')
                    ->pluck('id')
                    ->values()
                    ->all();
            } catch (\Throwable $exception) {
                Log::warning('mc_software: failed to fetch vanilla version list', ['exception' => $exception->getMessage()]);

                return [];
            }
        });
    }

    /**
     * PaperMC "Fill" v3 API. Used for both `paper` and `velocity` projects
     * (and would work for purpur-style forks if PaperMC ever hosts them).
     *
     * @return string[] newest-first list of Minecraft/product versions
     */
    public function paperProjectVersions(string $project): array
    {
        return Cache::remember("mc_software:papermc:{$project}", now()->addMinutes(self::CACHE_TTL_MINUTES), function () use ($project) {
            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(10)
                    ->get("https://fill.papermc.io/v3/projects/{$project}");

                if (!$response->successful()) {
                    return [];
                }

                // Shape: { "versions": { "1.21": ["1.21", "1.21.1", ...], ... } }
                // grouped by major version, oldest group first, oldest version first.
                $groups = $response->json('versions', []);
                $flat = collect($groups)->flatMap(fn ($versions) => $versions)->values()->all();

                return array_reverse($flat);
            } catch (\Throwable $exception) {
                Log::warning("mc_software: failed to fetch {$project} version list", ['exception' => $exception->getMessage()]);

                return [];
            }
        });
    }

    /**
     * Build numbers for a given PaperMC-family project + Minecraft version,
     * newest first. Only STABLE channel builds are returned.
     *
     * @return int[]
     */
    public function paperProjectBuilds(string $project, string $mcVersion): array
    {
        $cacheKey = "mc_software:papermc:{$project}:{$mcVersion}:builds";

        return Cache::remember($cacheKey, now()->addMinutes(self::CACHE_TTL_MINUTES), function () use ($project, $mcVersion) {
            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(10)
                    ->get("https://fill.papermc.io/v3/projects/{$project}/versions/{$mcVersion}/builds");

                if (!$response->successful()) {
                    return [];
                }

                return collect($response->json())
                    ->where('channel', 'STABLE')
                    ->pluck('id')
                    ->sortDesc()
                    ->values()
                    ->all();
            } catch (\Throwable $exception) {
                Log::warning("mc_software: failed to fetch {$project} builds for {$mcVersion}", ['exception' => $exception->getMessage()]);

                return [];
            }
        });
    }

    /**
     * Purpur has its own (simpler) API, mirroring the legacy PaperMC v2 shape.
     *
     * @return string[]
     */
    public function purpurVersions(): array
    {
        return Cache::remember('mc_software:purpur:versions', now()->addMinutes(self::CACHE_TTL_MINUTES), function () {
            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(10)
                    ->get('https://api.purpurmc.org/v2/purpur');

                if (!$response->successful()) {
                    return [];
                }

                return array_reverse($response->json('versions', []));
            } catch (\Throwable $exception) {
                Log::warning('mc_software: failed to fetch purpur version list', ['exception' => $exception->getMessage()]);

                return [];
            }
        });
    }

    /**
     * @return int[] newest-first build numbers for a Purpur MC version
     */
    public function purpurBuilds(string $mcVersion): array
    {
        $cacheKey = "mc_software:purpur:{$mcVersion}:builds";

        return Cache::remember($cacheKey, now()->addMinutes(self::CACHE_TTL_MINUTES), function () use ($mcVersion) {
            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(10)
                    ->get("https://api.purpurmc.org/v2/purpur/{$mcVersion}");

                if (!$response->successful()) {
                    return [];
                }

                $builds = $response->json('builds.all', []);

                return collect($builds)->reverse()->values()->all();
            } catch (\Throwable $exception) {
                Log::warning("mc_software: failed to fetch purpur builds for {$mcVersion}", ['exception' => $exception->getMessage()]);

                return [];
            }
        });
    }

    /**
     * Fabric: game versions Fabric Loader is known to support.
     *
     * @return string[]
     */
    public function fabricGameVersions(): array
    {
        return Cache::remember('mc_software:fabric:game', now()->addMinutes(self::CACHE_TTL_MINUTES), function () {
            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(10)
                    ->get('https://meta.fabricmc.net/v2/versions/game');

                if (!$response->successful()) {
                    return [];
                }

                return collect($response->json())
                    ->where('stable', true)
                    ->pluck('version')
                    ->values()
                    ->all();
            } catch (\Throwable $exception) {
                Log::warning('mc_software: failed to fetch fabric game versions', ['exception' => $exception->getMessage()]);

                return [];
            }
        });
    }

    /**
     * Fabric Loader versions, newest first (not tied to a specific MC version --
     * Fabric Loader is largely decoupled from the game version).
     *
     * @return string[]
     */
    public function fabricLoaderVersions(): array
    {
        return Cache::remember('mc_software:fabric:loader', now()->addMinutes(self::CACHE_TTL_MINUTES), function () {
            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(10)
                    ->get('https://meta.fabricmc.net/v2/versions/loader');

                if (!$response->successful()) {
                    return [];
                }

                return collect($response->json())
                    ->pluck('version')
                    ->values()
                    ->all();
            } catch (\Throwable $exception) {
                Log::warning('mc_software: failed to fetch fabric loader versions', ['exception' => $exception->getMessage()]);

                return [];
            }
        });
    }

    /**
     * NeoForge versions grouped by Minecraft version. NeoForge's own version
     * string encodes the MC version: "{mcMinor}.{mcPatch}.{build}[-beta]",
     * e.g. 20.2.17-beta => Minecraft 1.20.2. 21.1.x => 1.21.1, etc.
     *
     * @return array<string, string[]> mcVersion => [neoforgeVersion, ...] newest first
     */
    public function neoforgeVersionsByMcVersion(): array
    {
        return Cache::remember('mc_software:neoforge:grouped', now()->addMinutes(self::CACHE_TTL_MINUTES), function () {
            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(10)
                    ->get('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');

                if (!$response->successful()) {
                    return [];
                }

                return $this->groupNeoforgeStyleVersions($response->body());
            } catch (\Throwable $exception) {
                Log::warning('mc_software: failed to fetch neoforge version list', ['exception' => $exception->getMessage()]);

                return [];
            }
        });
    }

    /**
     * Classic Forge versions grouped by Minecraft version. Forge's maven
     * version strings are "{mcVersion}-{forgeBuild}", e.g. "1.20.1-47.3.0".
     *
     * @return array<string, string[]> mcVersion => [forgeVersion, ...] newest first
     */
    public function forgeVersionsByMcVersion(): array
    {
        return Cache::remember('mc_software:forge:grouped', now()->addMinutes(self::CACHE_TTL_MINUTES), function () {
            try {
                $response = Http::withHeaders(['User-Agent' => self::USER_AGENT])
                    ->timeout(10)
                    ->get('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');

                if (!$response->successful()) {
                    return [];
                }

                return $this->groupForgeStyleVersions($response->body());
            } catch (\Throwable $exception) {
                Log::warning('mc_software: failed to fetch forge version list', ['exception' => $exception->getMessage()]);

                return [];
            }
        });
    }

    /**
     * Forge's maven-metadata.xml <version> entries look like "1.20.1-47.3.0"
     * i.e. "{mcVersion}-{forgeVersion}" -- the MC version is just the prefix
     * before the first hyphen block. Group directly on that.
     *
     * @return array<string, string[]>
     */
    protected function groupForgeStyleVersions(string $xml): array
    {
        $versions = $this->extractXmlVersions($xml);
        $grouped = [];

        foreach ($versions as $version) {
            // e.g. "1.20.1-47.3.0" -> mc = "1.20.1"
            if (!str_contains($version, '-')) {
                continue;
            }
            [$mcVersion] = explode('-', $version, 2);
            $grouped[$mcVersion][] = $version;
        }

        foreach ($grouped as &$list) {
            $list = array_reverse($list);
        }

        return $grouped;
    }

    /**
     * NeoForge's maven-metadata.xml <version> entries follow their own
     * calver-ish scheme: "{mcMinor}.{mcPatch}.{build}[-beta]" for MC 1.x
     * releases (mc major "1" is implied), e.g. "20.2.17-beta" => 1.20.2,
     * "21.1.42" => 1.21.1. From MC "26.x" onward NeoForge tracks Mojang's
     * new calver scheme directly, e.g. "26.1.5" => Minecraft 26.1.
     *
     * @return array<string, string[]>
     */
    protected function groupNeoforgeStyleVersions(string $xml): array
    {
        $versions = $this->extractXmlVersions($xml);
        $grouped = [];

        foreach ($versions as $version) {
            $bare = preg_replace('/-.*/', '', $version); // strip "-beta" etc.
            $parts = explode('.', $bare);

            if (count($parts) < 2) {
                continue;
            }

            // Old scheme (major.minor.patch where major < 26): mc = "1.{major}.{minor}"
            // (trailing .0 patch is conventionally dropped, e.g. 1.20.1 not 1.20.1.0)
            if ((int) $parts[0] < 26) {
                $mcVersion = $parts[1] === '0' && count($parts) >= 1
                    ? "1.{$parts[0]}"
                    : "1.{$parts[0]}." . ($parts[1] ?? '0');
                if (($parts[1] ?? '0') === '0') {
                    $mcVersion = "1.{$parts[0]}";
                }
            } else {
                // New calver scheme mirrors Mojang's own "{year}.{release}" versioning directly.
                $mcVersion = "{$parts[0]}.{$parts[1]}";
            }

            $grouped[$mcVersion][] = $version;
        }

        foreach ($grouped as &$list) {
            $list = array_reverse($list);
        }

        return $grouped;
    }

    /**
     * @return string[] raw <version> text values in document order
     */
    protected function extractXmlVersions(string $xml): array
    {
        $previous = libxml_use_internal_errors(true);
        $doc = simplexml_load_string($xml);
        libxml_use_internal_errors($previous);

        if ($doc === false) {
            return [];
        }

        $versions = [];
        foreach ($doc->xpath('//versioning/versions/version') ?: [] as $node) {
            $versions[] = (string) $node;
        }

        return $versions;
    }
}
