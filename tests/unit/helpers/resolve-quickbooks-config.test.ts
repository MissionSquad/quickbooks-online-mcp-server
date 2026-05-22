import { describe, it, expect } from '@jest/globals';
import { UserError } from '@missionsquad/fastmcp';

import {
  readQuickbooksDefaultsFromEnv,
  resolveQuickbooksConfig,
} from '../../../src/helpers/resolve-quickbooks-config';

const completeDefaults = {
  clientId: 'env-client-id',
  clientSecret: 'env-client-secret',
  refreshToken: 'env-refresh-token',
  realmId: 'env-realm-id',
  environment: 'sandbox',
  redirectUri: 'http://localhost:8000/callback',
};

describe('resolveQuickbooksConfig', () => {
  it('resolves entirely from env-style defaults when no hidden args are present', () => {
    const resolved = resolveQuickbooksConfig(undefined, completeDefaults);

    expect(resolved).toEqual({
      clientId: 'env-client-id',
      clientSecret: 'env-client-secret',
      refreshToken: 'env-refresh-token',
      realmId: 'env-realm-id',
      environment: 'sandbox',
      redirectUri: 'http://localhost:8000/callback',
    });
  });

  it('lets hidden args override env defaults per field', () => {
    const resolved = resolveQuickbooksConfig(
      {
        clientId: 'hidden-client-id',
        refreshToken: 'hidden-refresh',
        environment: 'production',
      },
      completeDefaults
    );

    expect(resolved.clientId).toBe('hidden-client-id');
    expect(resolved.refreshToken).toBe('hidden-refresh');
    expect(resolved.environment).toBe('production');
    // unchanged fields fall back to env defaults
    expect(resolved.clientSecret).toBe('env-client-secret');
    expect(resolved.realmId).toBe('env-realm-id');
  });

  it('trims surrounding whitespace from hidden string values', () => {
    const resolved = resolveQuickbooksConfig(
      { clientId: '   trimmed   ' },
      completeDefaults
    );

    expect(resolved.clientId).toBe('trimmed');
  });

  it('treats null/undefined hidden values as absent', () => {
    const resolved = resolveQuickbooksConfig(
      { clientId: undefined, clientSecret: null },
      completeDefaults
    );

    expect(resolved.clientId).toBe('env-client-id');
    expect(resolved.clientSecret).toBe('env-client-secret');
  });

  it('throws UserError when a required field is missing in both hidden and defaults', () => {
    const defaults = { ...completeDefaults, clientId: undefined };
    expect(() => resolveQuickbooksConfig(undefined, defaults)).toThrow(
      UserError
    );
    expect(() => resolveQuickbooksConfig(undefined, defaults)).toThrow(
      /clientId/
    );
  });

  it('lists every missing field in the error message', () => {
    const defaults = {
      ...completeDefaults,
      clientId: undefined,
      clientSecret: undefined,
      refreshToken: undefined,
      realmId: undefined,
    };
    expect(() => resolveQuickbooksConfig(undefined, defaults)).toThrow(
      /clientId.*clientSecret.*refreshToken.*realmId/
    );
  });

  it('throws UserError when a hidden value is not a string', () => {
    expect(() =>
      resolveQuickbooksConfig({ clientId: 42 as unknown as string }, completeDefaults)
    ).toThrow(UserError);
  });

  it('throws UserError when a hidden value is an empty / whitespace-only string', () => {
    expect(() =>
      resolveQuickbooksConfig({ clientId: '' }, completeDefaults)
    ).toThrow(UserError);
    expect(() =>
      resolveQuickbooksConfig({ clientSecret: '   ' }, completeDefaults)
    ).toThrow(UserError);
  });

  it('rejects an unknown environment value', () => {
    expect(() =>
      resolveQuickbooksConfig(
        { environment: 'staging' },
        completeDefaults
      )
    ).toThrow(/sandbox.*production/i);
  });

  it('accepts production environment case-insensitively', () => {
    const resolved = resolveQuickbooksConfig(
      { environment: 'PRODUCTION' },
      completeDefaults
    );
    expect(resolved.environment).toBe('production');
  });

  it('defaults environment to sandbox when neither hidden nor env provides one', () => {
    const defaults = { ...completeDefaults, environment: undefined };
    const resolved = resolveQuickbooksConfig(undefined, defaults);
    expect(resolved.environment).toBe('sandbox');
  });

  it('defaults redirectUri to localhost when env default is empty', () => {
    const defaults = { ...completeDefaults, redirectUri: '   ' };
    const resolved = resolveQuickbooksConfig(undefined, defaults);
    expect(resolved.redirectUri).toBe('http://localhost:8000/callback');
  });

  it('preserves an explicit redirectUri default', () => {
    const defaults = {
      ...completeDefaults,
      redirectUri: 'https://example.ngrok-free.app/callback',
    };
    const resolved = resolveQuickbooksConfig(undefined, defaults);
    expect(resolved.redirectUri).toBe(
      'https://example.ngrok-free.app/callback'
    );
  });
});

describe('readQuickbooksDefaultsFromEnv', () => {
  it('reads each QUICKBOOKS_* variable into the matching field', () => {
    const env = {
      QUICKBOOKS_CLIENT_ID: 'cid',
      QUICKBOOKS_CLIENT_SECRET: 'csec',
      QUICKBOOKS_REFRESH_TOKEN: 'rt',
      QUICKBOOKS_REALM_ID: 'realm',
      QUICKBOOKS_ENVIRONMENT: 'production',
      QUICKBOOKS_REDIRECT_URI: 'https://example/callback',
    } as unknown as NodeJS.ProcessEnv;

    expect(readQuickbooksDefaultsFromEnv(env)).toEqual({
      clientId: 'cid',
      clientSecret: 'csec',
      refreshToken: 'rt',
      realmId: 'realm',
      environment: 'production',
      redirectUri: 'https://example/callback',
    });
  });

  it('uses process.env when no argument is provided', () => {
    // Smoke-test the default arg path; values are whatever the test runner has.
    expect(typeof readQuickbooksDefaultsFromEnv()).toBe('object');
  });
});
