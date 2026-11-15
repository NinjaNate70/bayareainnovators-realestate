'use client';
import Link from 'next/link';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
export default function CaseError({ reset }: { reset: () => void }) { return <Shell><div className="notice" role="alert"><h1>We couldn’t open this case.</h1><p>Your browser’s saved files have not been deleted. Try opening it again.</p><div className="split-row wrap"><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><Link href="/">Back home</Link></Button></div></div></Shell>; }
