"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { readStoredArgumentsView } from "@/components/view-toggle";
import { Spinner } from "@/components/spinner";

export default function ArgumentsRedirect() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    if (!id) return;
    router.replace(`/ballot/${id}/arguments/${readStoredArgumentsView()}`);
  }, [id, router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Spinner />
    </div>
  );
}
