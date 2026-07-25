<?php

namespace Pterodactyl\Services\McSoftware;

use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\EggVariable;
use Pterodactyl\Models\ServerVariable;
use Illuminate\Database\ConnectionInterface;
use Pterodactyl\Services\Servers\ReinstallServerService;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

/**
 * Client-facing equivalent of the admin "change egg + startup" flow, scoped
 * specifically to switching Minecraft server software (Paper, Forge,
 * NeoForge, Fabric, Vanilla, Purpur, Velocity, ...) via the `mc_software`
 * config mapping. Unlike the admin StartupModificationService this does NOT
 * require Permission::ACTION_ADMIN -- access is instead gated by the caller
 * via Permission::ACTION_STARTUP_SOFTWARE, checked in ChangeSoftwareRequest.
 *
 * This intentionally always ends in a full reinstall: switching software
 * means switching install scripts, so the server's files are not expected
 * to carry over safely.
 */
class ChangeServerSoftwareService
{
    public function __construct(
        private ConnectionInterface $connection,
        private ReinstallServerService $reinstallServerService
    ) {
    }

    /**
     * @throws \Throwable
     */
    public function handle(Server $server, string $softwareKey, string $minecraftVersion, ?string $loaderVersion): Server
    {
        $definition = $this->resolveSoftwareDefinition($softwareKey);

        $eggId = $definition['egg_id'] ?? null;
        if (!is_int($eggId)) {
            throw new BadRequestHttpException(
                "The \"{$definition['label']}\" software has not been configured by the panel administrator yet (missing egg_id in config/mc_software.php)."
            );
        }

        /** @var Egg $egg */
        $egg = Egg::query()->findOrFail($eggId);

        $server = $this->connection->transaction(function () use ($server, $egg, $definition, $minecraftVersion, $loaderVersion) {
            // Switch egg + nest to match the chosen software. This mirrors what
            // StartupModificationService::updateAdministrativeSettings() does,
            // but is reachable without an admin user level.
            $server = $server->forceFill([
                'egg_id' => $egg->id,
                'nest_id' => $egg->nest_id,
                'startup' => $egg->startup ?? $server->startup,
                'image' => $this->resolveDockerImage($egg, $server->image),
            ]);
            $server->save();

            $this->applyVersionVariables($server, $egg, $definition, $minecraftVersion, $loaderVersion);

            return $server->fresh();
        });

        // Reinstalling wipes/reruns the egg's install script against this server,
        // which is the actual mechanism that fetches & installs the chosen version.
        $this->reinstallServerService->handle($server);

        return $server;
    }

    /**
     * Picks a docker image for the new egg. If the server's current image is
     * one of the new egg's supported images, keep it; otherwise fall back to
     * the egg's first/default image.
     */
    protected function resolveDockerImage(Egg $egg, string $currentImage): string
    {
        $images = array_values($egg->docker_images ?? []);

        if (in_array($currentImage, $images, true)) {
            return $currentImage;
        }

        return $images[0] ?? $currentImage;
    }

    /**
     * Sets the Minecraft version (and loader/build version, if applicable)
     * as server variables on the new egg, provided the egg actually defines
     * a matching environment variable and it's user editable (or does not
     * already exist as a server variable yet).
     */
    protected function applyVersionVariables(Server $server, Egg $egg, array $definition, string $minecraftVersion, ?string $loaderVersion): void
    {
        $values = [];

        if (!empty($definition['version_variable'])) {
            $values[$definition['version_variable']] = $minecraftVersion;
        }

        if (!empty($definition['loader_variable']) && $loaderVersion !== null && $loaderVersion !== '') {
            $values[$definition['loader_variable']] = $loaderVersion;
        }

        if (empty($values)) {
            return;
        }

        $variables = EggVariable::query()
            ->where('egg_id', $egg->id)
            ->whereIn('env_variable', array_keys($values))
            ->get();

        foreach ($variables as $variable) {
            ServerVariable::query()->updateOrCreate(
                [
                    'server_id' => $server->id,
                    'variable_id' => $variable->id,
                ],
                ['variable_value' => $values[$variable->env_variable]]
            );
        }
    }

    /**
     * @return array{label: string, egg_id: int|null, version_variable: string|null, loader_variable: string|null, category: string}
     */
    protected function resolveSoftwareDefinition(string $softwareKey): array
    {
        $definition = config("mc_software.software.{$softwareKey}");

        if (!is_array($definition)) {
            throw new BadRequestHttpException("Unknown server software \"{$softwareKey}\".");
        }

        return $definition;
    }
}
