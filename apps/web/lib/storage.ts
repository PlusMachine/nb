export interface StorageAdapter {
  upload(params: { key: string; body: Buffer | string; contentType?: string }): Promise<void>;
  getPublicUrl(key: string): string;
}

export class MockStorageAdapter implements StorageAdapter {
  async upload(): Promise<void> {
    return;
  }

  getPublicUrl(key: string) {
    return `https://storage.local/${key}`;
  }
}

export const storageAdapter: StorageAdapter = new MockStorageAdapter();
