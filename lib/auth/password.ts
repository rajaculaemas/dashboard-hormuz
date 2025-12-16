import * as crypto from 'crypto';
import { prisma } from '@/lib/prisma';

/**
 * Hash password using PBKDF2
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against hash
 */
export function verifyPassword(password: string, hash: string): boolean {
  const [salt, storedHash] = hash.split(':');
  if (!salt || !storedHash) return false;
  
  const computedHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return computedHash === storedHash;
}

/**
 * Role permissions mapping
 */
export const rolePermissions = {
  administrator: [
    'view_alerts',
    'update_alert_status',
    'view_cases',
    'create_case',
    'update_case',
    'view_integrations',
    'manage_integrations',
    'view_users',
    'create_user',
    'update_user',
    'delete_user',
    'manage_roles',
  ],
  analyst: [
    'view_alerts',
    'update_alert_status',
    'view_cases',
    'create_case',
    'update_case',
    'view_integrations',
  ],
  'read-only': [
    'view_alerts',
    'view_cases',
    'view_integrations',
  ],
};

/**
 * Check if user has permission
 */
export function hasPermission(userRole: string, permission: string): boolean {
  const permissions = rolePermissions[userRole as keyof typeof rolePermissions] || [];
  return permissions.includes(permission);
}

/**
 * Get list of integration IDs that user can access
 * Administrators can access all integrations
 */
export async function getUserAccessibleIntegrations(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      assignedIntegrations: {
        select: {
          integrationId: true,
        },
      },
    },
  });

  if (!user) return [];

  // Administrators have access to all integrations
  if (user.role === 'administrator') {
    const allIntegrations = await prisma.integration.findMany({
      select: { id: true },
    });
    return allIntegrations.map(i => i.id);
  }

  // Non-administrators only have access to assigned integrations
  return user.assignedIntegrations.map(ai => ai.integrationId);
}

/**
 * Check if user can access a specific integration
 */
export async function canAccessIntegration(userId: string, integrationId: string): Promise<boolean> {
  const accessibleIntegrations = await getUserAccessibleIntegrations(userId);
  return accessibleIntegrations.includes(integrationId);
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: string): string {
  const roleNames: Record<string, string> = {
    administrator: 'Administrator',
    analyst: 'Analyst',
    'read-only': 'Read Only',
  };
  return roleNames[role] || role;
}

/**
 * Get all available roles
 */
export function getAllRoles() {
  return [
    { value: 'administrator', label: 'Administrator', description: 'Full access including user management' },
    { value: 'analyst', label: 'Analyst', description: 'Can view and update alerts, create cases' },
    { value: 'read-only', label: 'Read Only', description: 'View only access' },
  ];
}
