export function disposeActiveMetro(): void;
export function mountMetro(mainEl: HTMLElement, registryUrl?: string): Promise<unknown>;
export function isMetroHash(): boolean;
export function installMetroRouting(mainEl: HTMLElement, registryUrl?: string): () => void;
