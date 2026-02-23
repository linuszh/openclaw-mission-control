"use client";

import { useState } from "react";
import { Mail, Plus, Trash2, Server, User, Lock, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useListAccountsApiV1EmailsAccountsGet, useCreateAccountApiV1EmailsAccountsPost, useDeleteAccountApiV1EmailsAccountsAccountIdDelete } from "@/api/generated/emails/emails";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { getListAccountsApiV1EmailsAccountsGetQueryKey } from "@/api/generated/emails/emails";

export function EmailAccountsSettings() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    email_address: "",
    imap_server: "",
    imap_port: 993,
    imap_username: "",
    imap_password: "",
    use_ssl: true,
  });

  const accountsQuery = useListAccountsApiV1EmailsAccountsGet();
  const createMutation = useCreateAccountApiV1EmailsAccountsPost({
    mutation: {
      onSuccess: () => {
        setIsAdding(false);
        queryClient.invalidateQueries({ queryKey: getListAccountsApiV1EmailsAccountsGetQueryKey() });
        setFormData({
          email_address: "",
          imap_server: "",
          imap_port: 993,
          imap_username: "",
          imap_password: "",
          use_ssl: true,
        });
      }
    }
  });

  const deleteMutation = useDeleteAccountApiV1EmailsAccountsAccountIdDelete({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccountsApiV1EmailsAccountsGetQueryKey() });
      }
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData as any });
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-500" />
            Email Sync Accounts
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure IMAP accounts for automated email triage and assistant relay.
          </p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Account
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="text-sm">Connect new IMAP account</CardTitle>
            <CardDescription>Enter your mail server details. We recommend using an App Password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-slate-500 flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Email Address
                  </label>
                  <Input 
                    placeholder="linus@example.com" 
                    value={formData.email_address}
                    onChange={e => setFormData({...formData, email_address: e.target.value})}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-slate-500 flex items-center gap-1">
                    <Server className="h-3 w-3" /> IMAP Server
                  </label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="imap.gmail.com" 
                      className="flex-1"
                      value={formData.imap_server}
                      onChange={e => setFormData({...formData, imap_server: e.target.value})}
                      required 
                    />
                    <Input 
                      type="number" 
                      className="w-24" 
                      value={formData.imap_port}
                      onChange={e => setFormData({...formData, imap_port: parseInt(e.target.value)})}
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-slate-500 flex items-center gap-1">
                    <User className="h-3 w-3" /> Username
                  </label>
                  <Input 
                    placeholder="Username" 
                    value={formData.imap_username}
                    onChange={e => setFormData({...formData, imap_username: e.target.value})}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-slate-500 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Password / App Secret
                  </label>
                  <Input 
                    type="password" 
                    placeholder="••••••••••••" 
                    value={formData.imap_password}
                    onChange={e => setFormData({...formData, imap_password: e.target.value})}
                    required 
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Connecting..." : "Connect Account"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {accountsQuery.isLoading ? (
          <div className="h-24 bg-slate-50 animate-pulse rounded-xl border border-slate-200" />
        ) : accountsQuery.data?.data?.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <Mail className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No email accounts connected yet.</p>
          </div>
        ) : (
          accountsQuery.data?.data?.map((account: any) => (
            <div key={account.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-slate-300 transition-colors">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold uppercase">
                  {account.email_address[0]}
                </div>
                <div>
                  <div className="font-medium text-slate-900">{account.email_address}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <Server className="h-3 w-3" /> {account.imap_server}:{account.imap_port}
                    <Badge variant="outline" className="text-[10px] py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200">
                      <Check className="h-2 w-2 mr-1" /> Connected
                    </Badge>
                  </div>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2"
                onClick={() => {
                  if (confirm("Delete this email account? This will also remove all synced messages.")) {
                    deleteMutation.mutate({ accountId: account.id });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
        <p className="text-xs text-amber-800 leading-relaxed">
          <strong>Security Note:</strong> Mission Control stores IMAP credentials in plain text in the database. 
          Always use an **App Password** instead of your main account password, and ensure your database is secure.
        </p>
      </div>
    </section>
  );
}
