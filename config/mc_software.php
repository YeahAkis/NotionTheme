<?php


return [

    'enabled' => env('MC_SOFTWARE_SELECTOR_ENABLED', true),

    'software' => [

        'vanilla' => [
            'label' => 'Vanilla',
            'egg_id' => null,
            'version_variable' => 'MINECRAFT_VERSION',
            'loader_variable' => null,
            'category' => 'server',
        ],

        'paper' => [
            'label' => 'Paper',
            'egg_id' => null,
            'version_variable' => 'MINECRAFT_VERSION',
            'loader_variable' => 'BUILD_NUMBER',
            'category' => 'server',
        ],

        'purpur' => [
            'label' => 'Purpur',
            'egg_id' => null,
            'version_variable' => 'MINECRAFT_VERSION',
            'loader_variable' => 'BUILD_NUMBER',
            'category' => 'server',
        ],

        'forge' => [
            'label' => 'Forge',
            'egg_id' => null,
            'version_variable' => 'MINECRAFT_VERSION',
            'loader_variable' => 'FORGE_VERSION',
            'category' => 'server',
        ],

        'neoforge' => [
            'label' => 'NeoForge',
            'egg_id' => null,
            'version_variable' => 'MINECRAFT_VERSION',
            'loader_variable' => 'NEOFORGE_VERSION',
            'category' => 'server',
        ],

        'fabric' => [
            'label' => 'Fabric',
            'egg_id' => null,
            'version_variable' => 'MINECRAFT_VERSION',
            'loader_variable' => 'FABRIC_LOADER_VERSION',
            'category' => 'server',
        ],

        'velocity' => [
            'label' => 'Velocity',
            'egg_id' => null,
            'version_variable' => 'MINECRAFT_VERSION',
            'loader_variable' => 'BUILD_NUMBER',
            'category' => 'proxy',
        ],

    ],

];
