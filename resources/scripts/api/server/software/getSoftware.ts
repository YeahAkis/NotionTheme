import http from '@/api/http';
import { SoftwareListResponse, SoftwareOption } from '@/api/server/software/types';

export default async (uuid: string): Promise<SoftwareListResponse> => {
    const { data } = await http.get(`/api/client/servers/${uuid}/software`);

    return {
        enabled: data.enabled,
        currentEggId: data.current_egg_id,
        software: (data.software || []).map(
            (item: any): SoftwareOption => ({
                key: item.key,
                label: item.label,
                category: item.category,
                isCurrent: item.is_current,
            })
        ),
    };
};
