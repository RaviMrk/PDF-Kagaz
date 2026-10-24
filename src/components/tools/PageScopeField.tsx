import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChoiceChips } from '@/components/ChoiceChips';
import { useTheme } from '@/theme/useTheme';
import { formatPageRanges, parsePageRanges, uniqueSortedPages } from '@/utils/pageRanges';

type Scope = 'all' | 'some';

/**
 * `value`: null for all pages, else the chosen 1-based pages; an empty list means Some pages
 * without a valid range yet (the caller cannot run).
 */
type Props = { pageCount: number; value: number[] | null; onChange(pages: number[] | null): void };

const capitalise = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`;

/** All pages, or some typed as ranges ("1-3, 5"), checked against the page count. */
export function PageScopeField({ pageCount, value, onChange }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // The typed text and the scope chip are this field's own; `value` only seeds them.
  const [text, setText] = useState(() => (value === null ? '' : formatPageRanges(value)));
  const [scope, setScope] = useState<Scope>(value === null ? 'all' : 'some');
  const parsed = text.trim() === '' ? null : parsePageRanges(text, pageCount);

  const report = (next: string) => {
    const result = parsePageRanges(next, pageCount);
    onChange(result.ok ? uniqueSortedPages(result.groups) : []);
  };

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: colors.text }]}>{t('scope.label')}</Text>
      <ChoiceChips<Scope>
        label={t('scope.label')}
        options={[
          { key: 'all', label: t('scope.all') },
          { key: 'some', label: t('scope.some') },
        ]}
        value={scope}
        onChange={(next) => {
          setScope(next);
          if (next === 'all') onChange(null);
          else report(text);
        }}
      />
      {scope === 'some' ? (
        <>
          <TextInput
            accessibilityLabel={t('scope.label')}
            placeholder={t('scope.placeholder')}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={(next) => {
              setText(next);
              report(next);
            }}
            autoCorrect={false}
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: parsed && !parsed.ok ? colors.danger : colors.border,
              },
            ]}
          />
          {parsed && !parsed.ok ? (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
              {t(`pages.error${capitalise(parsed.error)}`, { count: pageCount })}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  label: { fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
});
