/**
 * IdeaMine Tools SDK - HTTP Transport
 * HTTP client with retry logic, timeout, and error handling
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ToolLogger } from '../types';
import { HTTPError, NetworkError, TransportError } from '../utils/errors';
import { withRetry, RetryConfig, DEFAULT_RETRY_CONFIG } from './retry';
import { getTraceContext } from '../utils/telemetry';

// ============================================================================
// TRANSPORT CONFIGURATION
// ============================================================================

export interface HTTPTransportConfig {
  baseURL: string;
  timeout?: number;
  apiKey?: string;
  authToken?: string;
  headers?: Record<string, string>;
  retry?: Partial<RetryConfig>;
  logger?: ToolLogger;
}

// ============================================================================
// HTTP TRANSPORT
// ============================================================================

export class HTTPTransport {
  private client: AxiosInstance;
  private logger?: ToolLogger;
  private retryConfig: RetryConfig;

  constructor(config: HTTPTransportConfig) {
    this.logger = config.logger;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };

    // Create axios instance
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ideamine-tools-sdk/1.0.0',
        ...config.headers,
      },
    });

    // Add authentication if provided
    if (config.apiKey) {
      this.client.defaults.headers.common['X-API-Key'] = config.apiKey;
    }

    if (config.authToken) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${config.authToken}`;
    }

    // Add request interceptor for tracing
    this.client.interceptors.request.use((config) => {
      const traceContext = getTraceContext();

      if (traceContext.traceId) {
        config.headers = config.headers || {};
        config.headers['X-Trace-Id'] = traceContext.traceId;
      }

      if (traceContext.spanId) {
        config.headers = config.headers || {};
        config.headers['X-Span-Id'] = traceContext.spanId;
      }

      this.logger?.debug('HTTP request', {
        method: config.method?.toUpperCase(),
        url: config.url,
        headers: this.sanitizeHeaders(config.headers),
      });

      return config;
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        this.logger?.debug('HTTP response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        if (axios.isAxiosError(error)) {
          this.logger?.warn('HTTP error', {
            status: error.response?.status,
            url: error.config?.url,
            message: error.message,
          });
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * GET request
   */
  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({
      method: 'GET',
      url: path,
      ...config,
    });
  }

  /**
   * POST request
   */
  async post<T>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({
      method: 'POST',
      url: path,
      data,
      ...config,
    });
  }

  /**
   * PUT request
   */
  async put<T>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({
      method: 'PUT',
      url: path,
      data,
      ...config,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({
      method: 'DELETE',
      url: path,
      ...config,
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({
      method: 'PATCH',
      url: path,
      data,
      ...config,
    });
  }

  /**
   * Generic request with retry logic
   */
  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response = await withRetry(
        () => this.executeRequest<T>(config),
        this.retryConfig,
        this.logger
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Execute single HTTP request
   */
  private async executeRequest<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    try {
      return await this.client.request<T>(config);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          // HTTP error response
          throw HTTPError.fromResponse(
            error.response.status,
            JSON.stringify(error.response.data)
          );
        } else if (error.request) {
          // Network error (no response received)
          throw new NetworkError(
            `No response received from ${config.url}`,
            error
          );
        }
      }

      // Unknown error
      throw new TransportError(
        error instanceof Error ? error.message : String(error),
        false,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: unknown): Error {
    if (error instanceof HTTPError) {
      return error;
    }

    if (error instanceof NetworkError) {
      return error;
    }

    if (error instanceof TransportError) {
      return error;
    }

    if (error instanceof Error) {
      return new TransportError(error.message, false, error);
    }

    return new TransportError(String(error), false);
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: any): Record<string, string> {
    if (!headers) return {};

    const sanitized: Record<string, string> = {};
    const sensitiveKeys = ['authorization', 'x-api-key', 'cookie', 'set-cookie'];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.includes(lowerKey)) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.client.defaults.headers.common['X-API-Key'] = apiKey;
  }

  /**
   * Update base URL
   */
  setBaseURL(baseURL: string): void {
    this.client.defaults.baseURL = baseURL;
  }

  /**
   * Get underlying axios instance (for advanced usage)
   */
  getAxiosInstance(): AxiosInstance {
    return this.client;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create HTTP transport with config
 */
export function createHTTPTransport(config: HTTPTransportConfig): HTTPTransport {
  return new HTTPTransport(config);
}

/**
 * Build query string from object
 */
export function buildQueryString(params: Record<string, any>): string {
  const entries = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`).join('&');
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    });

  return entries.length > 0 ? `?${entries.join('&')}` : '';
}
