<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Response;
use Pterodactyl\Models\Server;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Services\McSoftware\MinecraftVersionService;
use Pterodactyl\Services\McSoftware\ChangeServerSoftwareService;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Software\GetSoftwareRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Software\ChangeSoftwareRequest;

class SoftwareController extends ClientApiController
{
    public function __construct(
        private MinecraftVersionService $versionService,
        private ChangeServerSoftwareService $changeServerSoftwareService
    ) {
        parent::__construct();
    }

    /**
     * Lists the software options available in this panel (per config/mc_software.php)
     * along with the currently selected software for this server, if it can be
     * determined from the server's current egg.
     */
    public function index(GetSoftwareRequest $request, Server $server): JsonResponse
    {
        $software = collect(config('mc_software.software', []))
            ->filter(fn ($definition) => is_int($definition['egg_id'] ?? null))
            ->map(function ($definition, $key) use ($server) {
                return [
                    'key' => $key,
                    'label' => $definition['label'],
                    'category' => $definition['category'] ?? 'server',
                    'is_current' => $server->egg_id === $definition['egg_id'],
                ];
            })
            ->values();

        return new JsonResponse([
            'enabled' => (bool) config('mc_software.enabled', true),
            'current_egg_id' => $server->egg_id,
            'software' => $software,
        ]);
    }

    /**
     * Returns the version list (and, where relevant, loader/build versions)
     * for a given software key, fetched live from upstream where possible.
     */
    public function versions(GetSoftwareRequest $request, Server $server, string $software): JsonResponse
    {
        $definition = config("mc_software.software.{$software}");
        if (!is_array($definition)) {
            return new JsonResponse(['error' => 'Unknown software.'], Response::HTTP_NOT_FOUND);
        }

        $mcVersion = $request->query('minecraft_version');

        return match ($software) {
            'vanilla' => new JsonResponse([
                'minecraft_versions' => $this->versionService->vanillaVersions(),
                'loader_versions' => [],
            ]),

            'paper' => new JsonResponse([
                'minecraft_versions' => $this->versionService->paperProjectVersions('paper'),
                'loader_versions' => $mcVersion ? $this->versionService->paperProjectBuilds('paper', $mcVersion) : [],
            ]),

            'velocity' => new JsonResponse([
                'minecraft_versions' => $this->versionService->paperProjectVersions('velocity'),
                'loader_versions' => $mcVersion ? $this->versionService->paperProjectBuilds('velocity', $mcVersion) : [],
            ]),

            'purpur' => new JsonResponse([
                'minecraft_versions' => $this->versionService->purpurVersions(),
                'loader_versions' => $mcVersion ? $this->versionService->purpurBuilds($mcVersion) : [],
            ]),

            'fabric' => new JsonResponse([
                'minecraft_versions' => $this->versionService->fabricGameVersions(),
                'loader_versions' => $this->versionService->fabricLoaderVersions(),
            ]),

            'forge' => (function () use ($mcVersion) {
                $grouped = $this->versionService->forgeVersionsByMcVersion();

                return new JsonResponse([
                    'minecraft_versions' => array_values(array_keys($grouped)),
                    'loader_versions' => $mcVersion ? ($grouped[$mcVersion] ?? []) : [],
                ]);
            })(),

            'neoforge' => (function () use ($mcVersion) {
                $grouped = $this->versionService->neoforgeVersionsByMcVersion();

                return new JsonResponse([
                    'minecraft_versions' => array_values(array_keys($grouped)),
                    'loader_versions' => $mcVersion ? ($grouped[$mcVersion] ?? []) : [],
                ]);
            })(),

            default => new JsonResponse(['error' => 'Unknown software.'], Response::HTTP_NOT_FOUND),
        };
    }

    /**
     * Changes the server's software/version. This is destructive -- it switches
     * the server's egg and triggers a full reinstall, which wipes server files.
     * The request requires an explicit `confirm: true` flag for this reason.
     *
     * @throws \Throwable
     */
    public function update(ChangeSoftwareRequest $request, Server $server): JsonResponse
    {
        $software = $request->input('software');
        $minecraftVersion = $request->input('minecraft_version');
        $loaderVersion = $request->input('loader_version');
        $previousEggId = $server->egg_id;

        $server = $this->changeServerSoftwareService->handle($server, $software, $minecraftVersion, $loaderVersion);

        Activity::event('server:software.change')
            ->property([
                'old_egg_id' => $previousEggId,
                'new_egg_id' => $server->egg_id,
                'software' => $software,
                'minecraft_version' => $minecraftVersion,
                'loader_version' => $loaderVersion,
            ])
            ->log();

        return new JsonResponse([], Response::HTTP_ACCEPTED);
    }
}
