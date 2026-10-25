import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ChoiceChips } from '@/components/ChoiceChips';

const options = [
  { key: 'colour', label: 'Colour' },
  { key: 'greyscale', label: 'Greyscale' },
  { key: 'bw', label: 'Black & white' },
] as const;

describe('ChoiceChips', () => {
  it('is a labelled radio group whose chip for the value is checked', async () => {
    await render(
      <ChoiceChips label="Filter" options={[...options]} value="greyscale" onChange={() => {}} />,
    );
    expect(screen.getByLabelText('Filter').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Greyscale' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Greyscale' })).not.toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Colour' })).not.toBeChecked();
  });

  it('reports the chosen key', async () => {
    const onChange = jest.fn();
    await render(
      <ChoiceChips label="Filter" options={[...options]} value="colour" onChange={onChange} />,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Black & white' }));
    expect(onChange).toHaveBeenCalledWith('bw');
  });

  it('blocks presses and says so when disabled', async () => {
    const onChange = jest.fn();
    await render(
      <ChoiceChips
        label="Filter"
        options={[...options]}
        value="colour"
        onChange={onChange}
        disabled
      />,
    );
    const chip = screen.getByRole('radio', { name: 'Greyscale' });
    expect(chip).toBeDisabled();
    await fireEvent.press(chip);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('wraps whole chips sized to their labels, one line each, never cut', async () => {
    await render(
      <ChoiceChips label="Filter" options={[...options]} value="colour" onChange={() => {}} />,
    );
    const group = StyleSheet.flatten(screen.getByLabelText('Filter').props.style);
    expect(group).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    const chip = StyleSheet.flatten(
      screen.getByRole('radio', { name: 'Black & white' }).props.style,
    );
    expect(chip.flex).toBeUndefined();
    expect(chip.minHeight).toBeGreaterThanOrEqual(48);
    const text = screen.getByText('Black & white');
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.ellipsizeMode).toBeUndefined();
  });

  it('scrolls one line of chips sideways instead of wrapping when asked (U1)', async () => {
    await render(
      <ChoiceChips
        label="Filter"
        options={[...options]}
        value="colour"
        onChange={() => {}}
        scroll
      />,
    );
    expect(screen.getByTestId('choice-chips-scroll').props.horizontal).toBe(true);
    const group = StyleSheet.flatten(screen.getByLabelText('Filter').props.style);
    expect(group).toMatchObject({ flexDirection: 'row', flexWrap: 'nowrap' });
    expect(screen.getByLabelText('Filter').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByText('Black & white').props.numberOfLines).toBe(1);
  });
});
