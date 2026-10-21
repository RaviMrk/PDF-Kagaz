import { createLastPageSaver } from '../lastPageSaver';

describe('createLastPageSaver', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('debounces to the last page', () => {
    const save = jest.fn();
    const s = createLastPageSaver(save);
    s.update(3);
    jest.advanceTimersByTime(200);
    s.update(4);
    s.update(5);
    jest.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(5);
  });

  it('flush saves now and the timer does not save again', () => {
    const save = jest.fn();
    const s = createLastPageSaver(save);
    s.update(6);
    s.flush();
    expect(save).toHaveBeenCalledWith(6);
    jest.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('never saves the same page twice in a row', () => {
    const save = jest.fn();
    const s = createLastPageSaver(save);
    s.update(6);
    s.flush();
    s.update(6);
    jest.advanceTimersByTime(1000);
    s.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('cancel drops a pending save', () => {
    const save = jest.fn();
    const s = createLastPageSaver(save);
    s.update(2);
    s.cancel();
    jest.advanceTimersByTime(1000);
    s.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('ignores invalid pages', () => {
    const save = jest.fn();
    const s = createLastPageSaver(save);
    s.update(0);
    s.update(2.5);
    s.update(NaN);
    s.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
