'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Edit2, Lock } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Fetch current user data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/auth/me');
        if (!response.ok) throw new Error('Failed to fetch user data');

        const data = await response.json();
        setUserData(data.user);
        setFormData((prev) => ({
          ...prev,
          name: data.user.name || '',
        }));
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to fetch user data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [toast]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('=== FORM SUBMIT START ===');
    console.log('userData:', userData);

    if (!userData?.id) {
      console.log('userData.id is missing!');
      toast({
        title: 'Error',
        description: 'User ID not found. Please refresh the page.',
        variant: 'destructive',
      });
      return;
    }

    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      console.log('Passwords do not match');
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    try {
      const updateData: any = {
        name: formData.name,
      };

      if (formData.newPassword) {
        updateData.password = formData.newPassword;
      }

      console.log('Sending update request:', {
        userId: userData.id,
        updateData,
      });

      const response = await fetch(`/api/auth/users/${userData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      console.log('Update successful!');
      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });

      console.log('Closing dialog...');
      setOpenDialog(false);
      
      console.log('Resetting form data...');
      setFormData({
        name: formData.name,
        password: '',
        newPassword: '',
        confirmPassword: '',
      });

      // Refresh user data
      console.log('Refreshing user data...');
      const updatedResponse = await fetch('/api/auth/me');
      if (updatedResponse.ok) {
        const updatedData = await updatedResponse.json();
        console.log('Updated user data:', updatedData.user);
        setUserData(updatedData.user);
      }
      
      console.log('=== FORM SUBMIT COMPLETE ===');
    } catch (error: any) {
      console.error('=== UPDATE ERROR ===', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'administrator':
        return 'bg-red-100 text-red-800';
      case 'analyst':
        return 'bg-blue-100 text-blue-800';
      case 'read-only':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">My Profile</h1>
        {userData && (
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <Button onClick={() => {
                console.log('Opening dialog with userData:', userData);
                setFormData({
                  name: userData.name || '',
                  password: '',
                  newPassword: '',
                  confirmPassword: '',
                });
              }}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
            </DialogTrigger>
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Edit Profile</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Full Name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Change Password (Optional)
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        placeholder="••••••••"
                        value={formData.newPassword}
                        onChange={(e) =>
                          setFormData({ ...formData, newPassword: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            confirmPassword: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      console.log('Manually closing dialog');
                      setOpenDialog(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-2">Email Address</p>
              <p className="text-lg font-medium">{userData?.email}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Full Name</p>
              <p className="text-lg font-medium">{userData?.name}</p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Role</p>
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(
                  userData?.role
                )}`}
              >
                {userData?.role}
              </span>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Status</p>
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  userData?.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {userData?.status}
              </span>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Account Created</p>
              <p className="text-lg font-medium">
                {formatDate(userData?.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">Last Updated</p>
              <p className="text-lg font-medium">
                {formatDate(userData?.updatedAt)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50">
        <CardHeader>
          <CardTitle className="text-base">Role Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {userData?.role === 'administrator' && (
            <div>
              <strong>Administrator:</strong> You have full access to all features
              including user management, system settings, and audit logs.
            </div>
          )}
          {userData?.role === 'analyst' && (
            <div>
              <strong>Analyst:</strong> You can view and manage alerts, cases,
              create tickets, and access training materials.
            </div>
          )}
          {userData?.role === 'read-only' && (
            <div>
              <strong>Read-Only:</strong> You can view data but cannot make any
              modifications. Contact an administrator if you need additional
              permissions.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
