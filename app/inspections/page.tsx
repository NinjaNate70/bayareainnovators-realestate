import type { Metadata } from 'next';
import Link from 'next/link';
import { Inspections } from './inspections';
import styles from './inspections.module.css';

export const metadata: Metadata = { title: 'My Inspections | Tenant Shield' };

export default function InspectionsPage() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>← Tenant Shield</Link>
      <header className={styles.header}>
        <h1>My Inspections</h1>
        <p>Keep move-in and move-out photos together by lease and room.</p>
      </header>
      <Inspections />
    </main>
  );
}
