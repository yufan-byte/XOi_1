"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, RefreshCw, Search, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api, loadAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatTeamQuota } from "@/lib/team-presentation";

interface TeamItem { id: number; name: string; pool: number; members: number; active: number; created_at: number }
const card = "rounded-2xl border border-border/60 bg-card p-4";

/** 我的团队（多团队）：名称搜索 + 分页，点进去是该团队的独立工作区。 */
export function TeamListView({ onOpen }: { onOpen: (teamId: number) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const size = 9;
  // 输入防抖：避免每敲一个字都打接口
  useEffect(() => {
    const timer = setTimeout(() => { setKeyword(input.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [input]);
  const query = useQuery({
    queryKey: ["team-list", loadAuth()?.user.id ?? 0, keyword, page],
    queryFn: () => api<{ items: TeamItem[]; total: number; page: number; size: number }>(`/api/team/list?q=${encodeURIComponent(keyword)}&page=${page}&size=${size}`),
    retry: false,
  });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">团队空间</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">我的团队</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">一个账号可以管理多个团队（一个班、一个项目各一个）。每个团队独立积分池、成员与消费账单。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={14} />{query.isFetching ? "更新中…" : "刷新"}</Button>
          <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} />新建团队</Button>
        </div>
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          aria-label="搜索团队"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="搜索团队名称"
          className="h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {query.isLoading && <div className={cn(card, "py-12 text-center text-sm text-muted-foreground")}>正在加载团队…</div>}
      {query.isError && (
        <div className={cn(card, "py-12 text-center text-sm text-danger")}>
          团队列表没加载出来，<button className="text-primary underline" onClick={() => void query.refetch()}>重试</button>
        </div>
      )}
      {query.isSuccess && !items.length && (
        <div className={cn(card, "py-14 text-center")}>
          <Users size={26} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{keyword ? `没有名字包含「${keyword}」的团队` : "还没有团队，先新建一个"}</p>
          <Button className="mt-4" onClick={() => setCreating(true)}><Plus size={14} />新建团队</Button>
        </div>
      )}

      {!!items.length && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => onOpen(team.id)}
              className={cn(card, "group flex flex-col gap-3 text-left transition hover:border-primary/40 hover:bg-primary/[0.03]")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{team.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">团队 ID {team.id} · {new Date(team.created_at).toLocaleDateString("zh-CN")} 创建</div>
                </div>
                <ArrowRight size={16} className="mt-1 shrink-0 text-muted-foreground transition group-hover:text-primary" />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Users size={13} />{team.members} 名成员 · {team.active} 活跃</span>
                <span className="inline-flex items-center gap-1"><Wallet size={13} />池 {formatTeamQuota(team.pool)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>第 {page} / {pages} 页 · 共 {total} 个团队</span>
          <div className="flex gap-3">
            <button disabled={page <= 1 || query.isFetching} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">上一页</button>
            <button disabled={page >= pages || query.isFetching} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">下一页</button>
          </div>
        </div>
      )}

      {creating && (
        <CreateTeamDialog
          onClose={() => setCreating(false)}
          onDone={(teamId) => {
            setCreating(false);
            void queryClient.invalidateQueries({ queryKey: ["team-list"] });
            navigate(`/team/${teamId}`);
          }}
        />
      )}
    </div>
  );
}

export function CreateTeamDialog({ onClose, onDone }: { onClose: () => void; onDone: (teamId: number) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy || !name.trim()) { if (!name.trim()) toast.error("请输入团队名称"); return; }
    setBusy(true);
    try {
      const team = await api<{ id: number; name: string }>("/api/team", { method: "POST", body: JSON.stringify({ action: "create", name: name.trim() }) });
      toast.success("团队已创建");
      onDone(team.id);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent title="新建团队" description="每个团队有独立的积分池、成员与消费记录，互不影响。">
        <input
          autoFocus
          aria-label="团队名称"
          maxLength={40}
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
          placeholder="例如：高一(2)班 · 短视频培训"
          className="h-10 w-full rounded-xl border bg-background px-3 outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
          <Button disabled={busy || !name.trim()} onClick={() => void submit()}>{busy ? "创建中…" : "创建"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
