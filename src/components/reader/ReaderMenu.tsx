import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/BottomSheet';
import { FileActionRow, useFileActions, type FileActionKey } from '@/components/useFileActions';
import type { FileRow } from '@/db/schema';
import type { FileActionError } from '@/stores/filesStore';
import type { ReaderAction } from '@/services/reader/readerActions';
import { toolById, type RunnableToolId } from '@/services/tools/toolRegistry';
import type { ReaderTheme } from '@/stores/settingsStore';
import { useTheme } from '@/theme/useTheme';

type Props = {
  visible: boolean;
  /** The open file, kept current (a rename shows at once). */
  file: FileRow;
  /** The file needs a password: Remove password is offered. */
  locked: boolean;
  theme: ReaderTheme;
  keepAwake: boolean;
  horizontal: boolean;
  /** A file action is running: the actions are disabled and "Preparing…" shows. */
  actionBusy?: boolean;
  onTheme(t: ReaderTheme): void;
  onKeepAwake(on: boolean): void;
  onHorizontal(on: boolean): void;
  onAction(a: ReaderAction): void;
  /** Opens a tool with this file chosen. */
  onTool(toolId: RunnableToolId): void;
  /** Deletes the file the reader's way (it lets go of the document first). */
  onDelete(id: string): Promise<FileActionError | null>;
  /** The file was deleted: the reader should close. */
  onDeleted(): void;
  /** A rename or move gave the file a new id: the reader switches to it. */
  onReplaced(id: string): void;
  onClose(): void;
};

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

const THEMES = [
  ['normal', 'reader.themeNormal'],
  ['night', 'reader.themeNight'],
  ['sepia', 'reader.themeSepia'],
] as const;

const ACTIONS: readonly (readonly [ReaderAction, string, Icon])[] = [
  ['share', 'reader.share', 'share-variant'],
  ['print', 'reader.print', 'printer'],
  ['openWith', 'reader.openWith', 'open-in-app'],
];

const TOOL_SHORTCUTS: readonly RunnableToolId[] = [
  'compress',
  'split',
  'organize',
  'page-numbers',
  'watermark',
  'sign',
  'protect',
  'pdf-to-images',
];

/**
 * Reader overflow menu, a scrolling bottom sheet: page colour, keep screen on, sideways paging,
 * the Files tab's actions for this file, share / print / open with, and tool shortcuts.
 */
export function ReaderMenu({
  visible,
  file,
  locked,
  theme,
  keepAwake,
  horizontal,
  actionBusy = false,
  onTheme,
  onKeepAwake,
  onHorizontal,
  onAction,
  onTool,
  onDelete,
  onDeleted,
  onReplaced,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fileActions = useFileActions(file, {
    remove: onDelete,
    onDone: (key: FileActionKey, id: string) => {
      if (key === 'delete') return onDeleted();
      if (id !== file.id) onReplaced(id);
      // A favourite flips in place; the other actions are done with the menu.
      if (key !== 'favorite') onClose();
    },
  });
  const fileBusy = fileActions.busy !== null;

  // Dismissal (backdrop, hardware back) is ignored while a file action is pending.
  const close = () => {
    if (fileBusy) return;
    fileActions.reset();
    onClose();
  };

  if (!visible) return null;
  if (fileActions.panel) return fileActions.panel;

  const header = (label: string) => (
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
      {label}
    </Text>
  );
  const divider = <View style={[styles.divider, { backgroundColor: colors.border }]} />;

  const toggleRow = (label: string, value: boolean, onChange: (on: boolean) => void) => (
    <Pressable
      key={label}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={styles.row}
    >
      <Text style={[styles.rowText, { color: colors.text }]}>{label}</Text>
      {/* The row is the accessible control; the switch is its visual state. */}
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
    </Pressable>
  );

  const actionRow = (
    key: string,
    label: string,
    icon: Icon,
    disabled: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, disabled && styles.disabled]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
      <Text style={[styles.rowText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );

  const toolRow = (toolId: RunnableToolId, label?: string) => {
    const tool = toolById(toolId);
    if (!tool) return null;
    return actionRow(toolId, label ?? t(tool.labelKey), tool.icon, fileBusy, () => onTool(toolId));
  };

  const deleteItem = fileActions.items.find((i) => i.key === 'delete');

  return (
    <BottomSheet
      animationType="fade"
      maxHeight="85%"
      onRequestClose={close}
      onScrimPress={close}
      scrimLabel={t('reader.close')}
    >
      <ScrollView testID="reader-menu-scroll">
        {header(t('reader.appearance'))}
        {THEMES.map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityLabel={t(label)}
            accessibilityState={{ checked: key === theme }}
            onPress={() => onTheme(key)}
            style={styles.row}
          >
            <MaterialCommunityIcons
              name={key === theme ? 'radiobox-marked' : 'radiobox-blank'}
              size={24}
              color={key === theme ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.rowText, { color: colors.text }]}>{t(label)}</Text>
          </Pressable>
        ))}
        {divider}
        {toggleRow(t('reader.keepAwake'), keepAwake, onKeepAwake)}
        {toggleRow(t('reader.horizontal'), horizontal, onHorizontal)}
        {divider}
        {header(t('reader.fileSection'))}
        {fileActions.errorKey ? (
          <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
            {t(fileActions.errorKey)}
          </Text>
        ) : null}
        {fileActions.items
          .filter((i) => i.key !== 'delete')
          .map((item) => (
            <FileActionRow key={item.key} item={item} busy={fileActions.busy} />
          ))}
        {actionBusy ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.rowText, { color: colors.textMuted }]}
            >
              {t('reader.preparing')}
            </Text>
          </View>
        ) : null}
        {ACTIONS.map(([action, label, icon]) =>
          actionRow(action, t(label), icon, actionBusy || fileBusy, () => onAction(action)),
        )}
        {deleteItem ? <FileActionRow item={deleteItem} busy={fileActions.busy} /> : null}
        {divider}
        {header(t('reader.toolsSection'))}
        {TOOL_SHORTCUTS.map((id) => toolRow(id))}
        {locked ? toolRow('unlock') : null}
        {toolRow('merge', t('reader.mergeWith'))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  error: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 48 },
  rowText: { flex: 1, fontSize: 16 },
  disabled: { opacity: 0.4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
});
