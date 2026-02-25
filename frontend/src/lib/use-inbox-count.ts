"use client";

import { useMemo } from "react";

import { useListBoardsApiV1BoardsGet } from "@/api/generated/boards/boards";
import { useListEmailsApiV1EmailsGet } from "@/api/generated/emails/emails";
import { useQuery } from "@tanstack/react-query";
import { listApprovalsApiV1BoardsBoardIdApprovalsGet } from "@/api/generated/approvals/approvals";
import type { ApiError } from "@/api/mutator";

export function useInboxCount(isSignedIn: boolean | null | undefined): number {
  const boardsQuery = useListBoardsApiV1BoardsGet(undefined, {
    query: {
      enabled: Boolean(isSignedIn),
      refetchInterval: 60_000,
      retry: false,
    },
    request: { cache: "no-store" },
  });

  const boards = useMemo(() => {
    if (boardsQuery.data?.status !== 200) return [];
    return boardsQuery.data.data.items ?? [];
  }, [boardsQuery.data]);

  const boardIdsKey = useMemo(() => {
    const ids = boards.map((b) => b.id);
    ids.sort();
    return ids.join(",");
  }, [boards]);

  const approvalsCountQuery = useQuery<number, ApiError>({
    queryKey: ["inbox-count", "approvals", boardIdsKey],
    enabled: Boolean(isSignedIn) && boards.length > 0,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => {
      const results = await Promise.allSettled(
        boards.map((board) =>
          listApprovalsApiV1BoardsBoardIdApprovalsGet(
            board.id,
            { limit: 200 },
            { cache: "no-store" },
          ),
        ),
      );
      let count = 0;
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.status === 200) {
          const items = result.value.data.items ?? [];
          count += items.filter((a) => a.status === "pending").length;
        }
      }
      return count;
    },
  });

  const emailsQuery = useListEmailsApiV1EmailsGet(
    {},
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 60_000,
        retry: false,
      },
    },
  );

  const emailCount = useMemo(() => {
    if (emailsQuery.data?.status !== 200) return 0;
    return (emailsQuery.data.data.items ?? []).length;
  }, [emailsQuery.data]);

  const approvalCount = approvalsCountQuery.data ?? 0;
  return approvalCount + emailCount;
}
