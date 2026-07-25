import http from '@/api/http';

export default (
    uuid: string,
    software: string,
    minecraftVersion: string,
    loaderVersion: string | null
): Promise<void> => {
    return new Promise((resolve, reject) => {
        http.post(`/api/client/servers/${uuid}/software`, {
            software,
            minecraft_version: minecraftVersion,
            loader_version: loaderVersion,
            confirm: true,
        })
            .then(() => resolve())
            .catch(reject);
    });
};
