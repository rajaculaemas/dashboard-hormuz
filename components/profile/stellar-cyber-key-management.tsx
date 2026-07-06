'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Credential {
  host: string;
  hasKey: boolean;
  createdAt: string;
  updatedAt: string;
  isMigratedFromGlobal?: boolean;
}

interface StellarCyberKeyManagementProps {
  userId: string;
}

// Map known Stellar Cyber hosts to friendly names
const HOST_NAMES: Record<string, string> = {
  '100.100.11.61': 'Stellar Cyber 1 (MSIG + TVRI)',
  '100.100.11.68': 'Stellar Bank Index',
};

export function StellarCyberKeyManagement({ userId }: StellarCyberKeyManagementProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [hosts, setHosts] = useState<string[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch user's Stellar Cyber credentials by host
  const fetchCredentials = async () => {
    try {
      setLoading(true);

      // Get all Stellar Cyber integrations to extract unique hosts
      const integrationsResponse = await fetch(`/api/integrations?source=stellar-cyber&t=${Date.now()}`);
      if (integrationsResponse.ok) {
        const data = await integrationsResponse.json();
        const integrations = data.integrations || data.data || [];
        
        // Extract unique hosts
        const uniqueHosts = new Set<string>();
        integrations.forEach((int: any) => {
          const credentials = int.credentials;
          if (credentials) {
            const credsArray = Array.isArray(credentials) ?credentials : [credentials];
            credsArray.forEach((cred: any) => {
              if (cred?.host) {
                uniqueHosts.add(cred.host);
              }
            });
          }
        });
        setHosts(Array.from(uniqueHosts).sort());
      }

      // Fetch user's Stellar Cyber credentials by host
      const credentialsResponse = await fetch(`/api/users/me/stellar-key/hosts?t=${Date.now()}`);
      if (credentialsResponse.ok) {
        const data = await credentialsResponse.json();
        setCredentials(data.credentials || []);
      }
    } catch (error) {
      console.error('Error fetching Stellar Cyber data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Stellar Cyber hosts',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, [toast]);

  // Refetch credentials when dialog is opened
  useEffect(() => {
    if (openDialog) {
      fetchCredentials();
    }
  }, [openDialog]);

  const handleOpenDialog = (host: string) => {
    setSelectedHost(host);
    setApiKey('');
    setOpenDialog(true);
  };

  const handleSaveKey = async () => {
    if (!selectedHost || !apiKey.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an API key',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/users/me/stellar-key/hosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: selectedHost,
          apiKey: apiKey.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save API key');
      }

      toast({
        title: 'Success',
        description: `API key saved for ${HOST_NAMES[selectedHost] || selectedHost}`,
      });

      // Refresh credentials with cache-busting
      const credentialsResponse = await fetch(`/api/users/me/stellar-key/hosts?t=${Date.now()}`);
      if (credentialsResponse.ok) {
        const data = await credentialsResponse.json();
        setCredentials(data.credentials || []);
      }

      setOpenDialog(false);
      setApiKey('');
    } catch (error) {
      console.error('Error saving API key:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save API key',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (host: string) => {
    const hostName = HOST_NAMES[host] || host;
    if (!confirm(`Delete API key for ${hostName}? You'll need to add it again to update alerts from this host.`)) {
      return;
    }

    try {
      setDeleting(host);
      const response = await fetch(
        `/api/users/me/stellar-key/hosts?host=${encodeURIComponent(host)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete API key');
      }

      toast({
        title: 'Success',
        description: `API key deleted for ${hostName}`,
      });

      // Refresh credentials with cache-busting
      const credentialsResponse = await fetch(`/api/users/me/stellar-key/hosts?t=${Date.now()}`);
      if (credentialsResponse.ok) {
        const data = await credentialsResponse.json();
        setCredentials(data.credentials || []);
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete API key',
        variant: 'destructive',
      });
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stellar Cyber API Keys</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Stellar Cyber API Keys by Host</CardTitle>
            <CardDescription>
              Manage API keys for each Stellar Cyber host. Each host may contain multiple integrations/tenants.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hosts.length === 0 ? (
          <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-center text-gray-600">
              No Stellar Cyber hosts configured. Add one from the Integrations menu.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {hosts.map((host) => {
              const credential = credentials.find((c) => c.host === host);
              const hasKey = credential?.hasKey || false;
              const displayName = HOST_NAMES[host] || host;

              return (
                <div
                  key={host}
                  className="flex items-center justify-between p-4 border rounded-lg bg-gray-50 hover:bg-gray-100 transition"
                >
                  <div className="flex items-center gap-3 flex-1">
                    {hasKey ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{displayName}</p>
                      <p className="text-xs text-gray-500">{host}</p>
                      {hasKey && credential ? (
                        <p className="text-sm text-green-600">
                          ✓ API key configured {credential.isMigratedFromGlobal ? '(from global key)' : ''} • Updated {new Date(credential.updatedAt).toLocaleDateString()}
                        </p>
                      ) : hasKey ? (
                        <p className="text-sm text-green-600">
                          ✓ API key configured • Updated recently
                        </p>
                      ) : (
                        <p className="text-sm text-amber-600">
                          ⚠ API key not configured
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Dialog open={openDialog && selectedHost === host} onOpenChange={setOpenDialog}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          onClick={() => handleOpenDialog(host)}
                          variant={hasKey ? 'outline' : 'default'}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          {hasKey ? 'Update' : 'Add'} Key
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            {hasKey ? 'Update' : 'Add'} API Key for {displayName}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div>
                            <Label htmlFor="apiKey">Stellar Cyber JWT API Key</Label>
                            <Input
                              id="apiKey"
                              type="password"
                              placeholder="Paste your JWT API key from Stellar Cyber"
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              className="mt-2"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                              Generate this key in your Stellar Cyber account under API settings.
                              This key will be used for all alert updates from {displayName} and all its integrations.
                            </p>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              onClick={() => setOpenDialog(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={handleSaveKey}
                              disabled={saving || !apiKey.trim()}
                            >
                              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                              Save Key
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    {hasKey && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteKey(host)}
                        disabled={deleting === host}
                      >
                        {deleting === host ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
