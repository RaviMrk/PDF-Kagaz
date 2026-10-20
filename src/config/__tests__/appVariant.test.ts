import Constants from 'expo-constants';

import { allFilesAccessEnabled } from '../appVariant';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: undefined } }));

const mocked = Constants as unknown as { expoConfig: unknown };

describe('allFilesAccessEnabled', () => {
  it('is false when the config disables it', () => {
    mocked.expoConfig = { extra: { allFilesAccessEnabled: false } };
    expect(allFilesAccessEnabled()).toBe(false);
  });

  it('defaults to true when extra is missing', () => {
    mocked.expoConfig = {};
    expect(allFilesAccessEnabled()).toBe(true);
    mocked.expoConfig = undefined;
    expect(allFilesAccessEnabled()).toBe(true);
  });
});
