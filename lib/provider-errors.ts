export type ProviderErrorCode =
  | 'PROVIDER_CONFIG'
  | 'PROVIDER_AUTH'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_ERROR';

export interface NormalizedProviderError {
  code: ProviderErrorCode;
  message: string;
}

export function normalizeProviderError(status: number, _body: unknown): NormalizedProviderError {
  if (status === 401 || status === 403) {
    return { code: 'PROVIDER_AUTH', message: '模型服务鉴权失败，请检查服务配置' };
  }
  if (status === 429) {
    return { code: 'PROVIDER_RATE_LIMIT', message: '模型服务当前繁忙，请稍后重试' };
  }
  if (status === 0 || status >= 500) {
    return { code: 'PROVIDER_UNAVAILABLE', message: '模型服务暂时不可用，请稍后重试' };
  }
  return { code: 'PROVIDER_ERROR', message: '模型请求失败，请检查输入后重试' };
}
