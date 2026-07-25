<?php

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Software;

use Pterodactyl\Models\Permission;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class ChangeSoftwareRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_STARTUP_SOFTWARE;
    }

    public function rules(): array
    {
        return [
            'software' => ['required', 'string'],
            'minecraft_version' => ['required', 'string', 'max:64'],
            'loader_version' => ['nullable', 'string', 'max:191'],
            // The user must explicitly confirm they understand this deletes all server files.
            'confirm' => ['required', 'accepted'],
        ];
    }
}
