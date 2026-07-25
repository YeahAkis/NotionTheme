import http from '@/api/http';
import { SoftwareVersionsResponse } from '@/api/server/software/types';

export default async (uuid: string, software: string, minecraftVersion?: string): Promise<SoftwareVersionsResponse> => {
    const { data } = await http.get(`/api/client/servers/${uuid}/software/${software}/versions`, {
        params: minecraftVersion ? { minecraft_version: minecraftVersion } : {},
    });

    return {
        minecraftVersions: data.minecraft_versions || [],
        loaderVersions: data.loader_versions || [],
    };
};
