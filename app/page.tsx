
"use client";

import { useState } from "react";

export default function Home() {
  const [rent, setRent] = useState(1200);
  const [marketRent] = useState(1000);

  const difference = rent - marketRent;

  return (
    <main className="max-w-xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-4">
        Tenant Shield
      </h1>

      <p className="mb-4">
        Compare your rent to an example benchmark.
      </p>

      <input
        type="number"
        value={rent}
        onChange={(e) =>
          setRent(Number(e.target.value))
        }
        className="border p-2 rounded w-full"
      />

      <p className="mt-4">
        Rent difference: ${difference}
      </p>
    </main>
  );
}
