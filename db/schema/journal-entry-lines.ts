import { pgTable, uuid, text, numeric, index } from 'drizzle-orm/pg-core'
import { journalEntries } from './journal-entries'
import { chartOfAccounts } from './chart-of-accounts'

// بند القيد — مدين أو دائن لحساب واحد. القيد الكامل صحيح محاسبياً فقط لو
// مجموع debit لكل بنوده = مجموع credit (يُتحقق منه بمنطق التطبيق، ليس هنا).
// عمودان منفصلان (debit/credit) بدل عمود واحد إشاري (signed amount) — أوضح
// للقراءة المحاسبية المباشرة ومطابق للممارسة القياسية في القيد المزدوج.
export const journalEntryLines = pgTable(
  'journal_entry_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    journalEntryId: uuid('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    debit: numeric('debit', { precision: 12, scale: 2 }).notNull().default('0'),
    credit: numeric('credit', { precision: 12, scale: 2 }).notNull().default('0'),
    description: text('description'),
  },
  (table) => [index('journal_entry_lines_entry_idx').on(table.journalEntryId)]
)
