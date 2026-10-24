import { nativeError } from '@/test-utils/fakePdfNative';

import { shareSavedImages, viewSavedImage } from '../imageActions';

const URIS = ['content://media/external/images/media/1', 'content://media/external/images/media/2'];

describe('shareSavedImages', () => {
  it('shares every saved image with the chooser title', async () => {
    const shareImages = jest.fn().mockResolvedValue(undefined);
    await expect(shareSavedImages(URIS, 'Share images', { shareImages })).resolves.toBe('ok');
    expect(shareImages).toHaveBeenCalledWith(URIS, 'Share images');
  });

  it('shares nothing when there are no images', async () => {
    const shareImages = jest.fn();
    await expect(shareSavedImages([], 'Share images', { shareImages })).resolves.toBe('notFound');
    expect(shareImages).not.toHaveBeenCalled();
  });

  it.each([
    ['ERR_FILE_NOT_FOUND', 'notFound'],
    ['ERR_PERMISSION_DENIED', 'permission'],
    ['ERR_NO_ACTIVITY', 'unknown'],
  ] as const)('maps %s to %s', async (code, expected) => {
    const shareImages = jest.fn().mockRejectedValue(nativeError(code));
    await expect(shareSavedImages(URIS, 'Share images', { shareImages })).resolves.toBe(expected);
  });
});

describe('viewSavedImage', () => {
  it('opens the image in a viewer', async () => {
    const viewImage = jest.fn().mockResolvedValue(undefined);
    await expect(viewSavedImage(URIS[0]!, 'Open', { viewImage })).resolves.toBe('ok');
    expect(viewImage).toHaveBeenCalledWith(URIS[0], 'Open');
  });

  it('maps a deleted image to notFound and anything else to unknown', async () => {
    const viewImage = jest.fn().mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
    await expect(viewSavedImage(URIS[0]!, 'Open', { viewImage })).resolves.toBe('notFound');
    viewImage.mockRejectedValueOnce(new Error('boom'));
    await expect(viewSavedImage(URIS[0]!, 'Open', { viewImage })).resolves.toBe('unknown');
  });
});
