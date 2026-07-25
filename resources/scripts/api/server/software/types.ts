export interface SoftwareOption {
    key: string;
    label: string;
    category: 'server' | 'proxy';
    isCurrent: boolean;
}

export interface SoftwareListResponse {
    enabled: boolean;
    currentEggId: number | null;
    software: SoftwareOption[];
}

export interface SoftwareVersionsResponse {
    minecraftVersions: string[];
    loaderVersions: (string | number)[];
}
