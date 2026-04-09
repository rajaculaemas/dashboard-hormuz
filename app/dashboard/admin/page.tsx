'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { TelegramSetupPanel } from '@/components/admin/telegram-setup-panel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Edit2 } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'administrator' | 'analyst' | 'read-only';
  position?: string; // "Analyst L1", "Analyst L2", "Analyst L3", "Security Engineer", "Manager"
  telegramChatId?: string; // User's Telegram chat ID
  status: string;
  createdAt: string;
  updatedAt: string;
  assignedIntegrations?: { integrationId: string; integration: { id: string; name: string } }[];
}

interface Integration {
  id: string;
  name: string;
  source: string;
  status: string;
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    role: 'analyst' as const,
    position: '',
    telegramChatId: '',
    integrationIds: [] as string[],
    stellarCyberApiKey: '',
  });
  const [userStellarKeys, setUserStellarKeys] = useState<{ [key: string]: boolean }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    if (user && user.role !== 'administrator') {
      toast({
        title: 'Access Denied',
        description: 'Only administrators can access this page.',
        variant: 'destructive',
      });
    }
  }, [user, toast]);

  useEffect(() => {
    fetchUsers();
    fetchIntegrations();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/users');
      if (!response.ok) throw new Error('Failed to fetch users');

      const data = await response.json();
      setUsers(data.users || []);
      
      // Fetch Stellar API key status for all users
      const keyStatus: { [key: string]: boolean } = {};
      for (const u of data.users) {
        try {
          const keyResponse = await fetch(`/api/users/${u.id}/stellar-key`);
          if (keyResponse.ok) {
            const keyData = await keyResponse.json();
            keyStatus[u.id] = keyData.hasApiKey;
          }
        } catch (err) {
          keyStatus[u.id] = false;
        }
      }
      setUserStellarKeys(keyStatus);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchIntegrations = async () => {
    try {
      const response = await fetch('/api/integrations');
      if (!response.ok) throw new Error('Failed to fetch integrations');

      const data = await response.json();
      setIntegrations(data.data || []);
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.role !== 'administrator' && formData.integrationIds.length === 0) {
      toast({
        title: 'Error',
        description: 'Non-administrator users must be assigned to at least one integration',
        variant: 'destructive',
      });
      return;
    }

    if (editingUser) {
      try {
        const response = await fetch(`/api/auth/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            role: formData.role,
            position: formData.position || null,
            telegramChatId: formData.telegramChatId || null,
            integrationIds: formData.integrationIds,
            ...(formData.password && { password: formData.password }),
          }),
        });

        if (!response.ok) throw new Error('Failed to update user');

        // Save Stellar API key if provided
        if (formData.stellarCyberApiKey.trim()) {
          try {
            const stellarResponse = await fetch(`/api/users/${editingUser.id}/stellar-key`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey: formData.stellarCyberApiKey }),
            });

            if (!stellarResponse.ok) {
              throw new Error('Failed to save Stellar API key');
            }
          } catch (error: any) {
            toast({
              title: 'Warning',
              description: error.message || 'Failed to save Stellar API key',
              variant: 'destructive',
            });
          }
        }

        toast({
          title: 'Success',
          description: 'User updated successfully',
        });

        setOpenDialog(false);
        setEditingUser(null);
        setFormData({ email: '', name: '', password: '', role: 'analyst', position: '', telegramChatId: '', integrationIds: [], stellarCyberApiKey: '' });
        fetchUsers();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to update user',
          variant: 'destructive',
        });
      }
    } else {
      if (!formData.password) {
        toast({
          title: 'Error',
          description: 'Password is required for new users',
          variant: 'destructive',
        });
        return;
      }

      try {
        const response = await fetch('/api/auth/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            position: formData.position || null,
            telegramChatId: formData.telegramChatId || null,
          }),
        });

        if (!response.ok) throw new Error('Failed to create user');

        toast({
          title: 'Success',
          description: 'User created successfully',
        });

        setOpenDialog(false);
        setFormData({ email: '', name: '', password: '', role: 'analyst', position: '', integrationIds: [], stellarCyberApiKey: '' });
        fetchUsers();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to create user',
          variant: 'destructive',
        });
      }
    }
  };

  const handleEdit = (u: User) => {
    setEditingUser(u);
    setFormData({
      email: u.email,
      name: u.name,
      password: '',
      role: u.role,
      position: u.position || '',
      telegramChatId: u.telegramChatId || '',
      integrationIds: u.assignedIntegrations?.map(ai => ai.integrationId) || [],
      stellarCyberApiKey: '',
    });
    setOpenDialog(true);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const response = await fetch(`/api/auth/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete user');

      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });

      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete user',
        variant: 'destructive',
      });
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingUser(null);
    setFormData({ email: '', name: '', password: '', role: 'analyst', integrationIds: [], stellarCyberApiKey: '' });
  };

  const toggleIntegration = (integrationId: string) => {
    setFormData(prev => ({
      ...prev,
      integrationIds: prev.integrationIds.includes(integrationId)
        ? prev.integrationIds.filter(id => id !== integrationId)
        : [...prev.integrationIds, integrationId]
    }));
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      searchTerm === '' ||
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  if (user?.role !== 'administrator') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-gray-600">
            You do not have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">User Management</h1>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditingUser(null);
                setFormData({ email: '', name: '', password: '', role: 'analyst', position: '', telegramChatId: '', integrationIds: [], stellarCyberApiKey: '' });
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-screen overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingUser ? 'Edit User' : 'Create New User'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  value={formData.email ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  disabled={!!editingUser}
                  required
                />
              </div>

              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Full Name"
                  value={formData.name ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="password">
                  Password {editingUser && '(leave blank to keep current)'}
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required={!editingUser}
                />
              </div>

              <div>
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrator">Administrator</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="read-only">Read-Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="position">Position</Label>
                <div className="flex gap-2">
                  <Select
                    value={formData.position || "none"}
                    onValueChange={(value) =>
                      setFormData({ ...formData, position: value === "none" ? "" : value })
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select position (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="Analyst L1">Analyst L1</SelectItem>
                      <SelectItem value="Analyst L2">Analyst L2</SelectItem>
                      <SelectItem value="Analyst L3">Analyst L3</SelectItem>
                      <SelectItem value="Security Engineer">Security Engineer</SelectItem>
                      <SelectItem value="Manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.position && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormData({ ...formData, position: "" })}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="telegramChatId">Telegram Chat ID (optional)</Label>
                <Input
                  id="telegramChatId"
                  placeholder="Enter Telegram chat ID"
                  value={formData.telegramChatId ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, telegramChatId: e.target.value })
                  }
                />
              </div>

              {editingUser && (
                <div className="border-t pt-4">
                  <Label className="text-base font-semibold mb-3 block">
                    Stellar Cyber API Key
                  </Label>
                  {userStellarKeys[editingUser.id] ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
                      <p className="text-sm text-green-800">
                        ✓ User has Stellar Cyber API Key configured
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-3">
                      <p className="text-sm text-yellow-800">
                        No Stellar Cyber API Key configured for this user
                      </p>
                    </div>
                  )}
                  <div>
                    <Label htmlFor="stellarApiKey">Add or Update API Key</Label>
                    <Input
                      id="stellarApiKey"
                      type="password"
                      placeholder="Paste Stellar Cyber API key here"
                      value={formData.stellarCyberApiKey ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, stellarCyberApiKey: e.target.value })
                      }
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Leave empty to keep current key
                    </p>
                  </div>
                </div>
              )}

              {formData.role !== 'administrator' && (
                <div className="border-t pt-4">
                  <Label className="text-base font-semibold mb-3 block">
                    Assigned Integrations
                  </Label>
                  <p className="text-sm text-gray-600 mb-3">
                    Select which integrations this user can access.
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                    {integrations.map((integration) => (
                      <div key={integration.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`integration-${integration.id}`}
                          checked={formData.integrationIds.includes(integration.id)}
                          onCheckedChange={() => toggleIntegration(integration.id)}
                        />
                        <label
                          htmlFor={`integration-${integration.id}`}
                          className="flex-1 cursor-pointer text-sm"
                        >
                          {integration.name}
                          <span className="text-xs text-gray-500 ml-2">({integration.source})</span>
                        </label>
                      </div>
                    ))}
                  </div>
                  {formData.integrationIds.length === 0 && (
                    <p className="text-sm text-red-600 mt-2">
                      At least one integration must be assigned
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingUser ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          type="search"
          placeholder="Search users by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="administrator">Administrator</SelectItem>
            <SelectItem value="analyst">Analyst</SelectItem>
            <SelectItem value="read-only">Read-Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Users ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Telegram Chat ID</TableHead>
                    <TableHead>Assigned Integrations</TableHead>
                    <TableHead>Stellar API Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        No users found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.email}</TableCell>
                        <TableCell>{u.name}</TableCell>
                        <TableCell>
                          <span className="px-2 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                            {u.role}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {u.position ? (
                            <span className="px-2 py-1 rounded-full text-sm bg-purple-100 text-purple-800">
                              {u.position}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {u.telegramChatId ? (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="text-sm text-green-700 font-medium">Configured</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                              <span className="text-sm text-gray-600">Not Set</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {u.role === 'administrator' ? (
                            <span className="text-green-600 font-medium">All Integrations</span>
                          ) : u.assignedIntegrations && u.assignedIntegrations.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {u.assignedIntegrations.map((ai) => (
                                <span
                                  key={ai.integrationId}
                                  className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs"
                                >
                                  {ai.integration.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs">None assigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {userStellarKeys[u.id] ? (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                              <span className="text-sm text-green-700 font-medium">Configured</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                              <span className="text-sm text-gray-600">Not Set</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded-full text-sm ${
                              u.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {u.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(u)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(u.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-blue-50">
        <CardHeader>
          <CardTitle className="text-base">Role Permissions & Integration Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <strong>Administrator:</strong> Full access to all features, user management, and all integrations
          </div>
          <div>
            <strong>Analyst:</strong> Can view and manage alerts, cases, create tickets. Limited to assigned integrations.
          </div>
          <div>
            <strong>Read-Only:</strong> View only access. Limited to assigned integrations.
          </div>
          <div className="text-xs text-gray-600 border-t pt-3">
            <p className="font-semibold">Integration Assignment Rules:</p>
            <ul className="list-disc ml-5 mt-2">
              <li>Administrators have access to all integrations by default</li>
              <li>Non-administrators must be assigned to at least one integration</li>
              <li>Users can only view/access data from their assigned integrations</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Telegram Bot Setup */}
      <h2 className="text-2xl font-bold">Telegram Bot Integration</h2>
      <TelegramSetupPanel />
    </div>
  );
}
