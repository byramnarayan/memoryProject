'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

interface Employee {
  id: number;
  employee_number: string | null;
  username: string;
  work_email: string;
  first_name: string | null;
  last_name: string | null;
  department: string;
  role: string;
  job_title: string | null;
  clearance_level: string;
  manager_id: number | null;
  manager_name: string | null;
  status: string;
  hire_date: string | null;
}

interface Department {
  id: number;
  name: string;
  code: string;
  employee_count: number;
}

interface Manager {
  id: number;
  name: string;
  job_title: string;
  department: string;
}

interface CredentialSlip {
  employee_number: string;
  name: string;
  username: string;
  work_email: string;
  job_title: string;
  department: string;
  role: string;
  clearance_level: string;
  temporary_password: string;
}

interface VaultItem {
  id: number;
  employee_number: string;
  full_name: string;
  work_email: string;
  username: string;
  department: string;
  role: string;
  job_title: string;
  clearance_level: string;
  temporary_password: string;
  source: string;
  handout_status: string;
  created_at: string | null;
  delivered_at: string | null;
}

export default function EmployeesPage() {
  const { user, token } = useAuth();
  const canManageEmployees = user?.role === 'TenantAdmin' || user?.role === 'DeptAdmin' || user?.role === 'HRManager';

  const [activeTab, setActiveTab] = useState<'directory' | 'vault'>('directory');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [isVaultLoading, setIsVaultLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');

  // Provisioning Modal State
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('Employee');
  const [clearanceLevel, setClearanceLevel] = useState('Internal');
  const [managerId, setManagerId] = useState<number | null>(null);
  const [customPassword, setCustomPassword] = useState('');

  // Credential Slip Modal State
  const [slip, setSlip] = useState<CredentialSlip | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchEmployeesData = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      // 1. Fetch Employees
      const empRes = await fetch('/api/employees', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (empRes.ok) {
        const empData = await empRes.json();
        setEmployees(empData);
      }

      // 2. Fetch Departments
      const deptRes = await fetch('/api/tenant/departments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(deptData);
        if (deptData.length > 0 && !department) {
          setDepartment(deptData[0].name);
        }
      }

      // 3. Fetch Managers
      const mgrRes = await fetch('/api/employees/managers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (mgrRes.ok) {
        const mgrData = await mgrRes.json();
        setManagers(mgrData);
      }
    } catch (err) {
      console.error('Error fetching employees data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVaultData = async () => {
    if (!token || !canManageEmployees) return;
    setIsVaultLoading(true);
    try {
      const res = await fetch('/api/employees/credential-vault', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVaultItems(data);
      }
    } catch (err) {
      console.error('Error fetching vault data:', err);
    } finally {
      setIsVaultLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeesData();
    if (canManageEmployees) {
      fetchVaultData();
    }
  }, [token, canManageEmployees]);

  const handleMarkDelivered = async (vaultId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/employees/credential-vault/${vaultId}/delivered`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setVaultItems(prev => prev.map(item => item.id === vaultId ? { ...item, handout_status: 'Delivered' } : item));
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const copyVaultSlip = (item: VaultItem) => {
    const text = `------------------------------------
MnemoGraph Enterprise Access Slip
Organization: ${user?.tenant_id || 'Enterprise'}
Employee: ${item.full_name} (${item.employee_number})
Work Email: ${item.work_email}
Username: ${item.username}
Temporary Password: ${item.temporary_password}
Role: ${item.role} (${item.department})
Clearance: ${item.clearance_level}
Source: ${item.source}
Portal: http://localhost:3000/login
------------------------------------`;
    navigator.clipboard.writeText(text);
    alert(`Credentials slip for ${item.full_name} copied to clipboard!`);
  };

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setFormError('');
    setIsSubmitting(true);

    try {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        work_email: workEmail,
        department,
        role,
        job_title: jobTitle,
        clearance_level: clearanceLevel,
        manager_id: managerId ? Number(managerId) : null,
        custom_password: customPassword.trim() ? customPassword : null
      };

      const res = await fetch('/api/employees/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to provision employee.');
      }

      // Success: Setup credential slip and refresh
      setSlip({
        employee_number: data.employee_number,
        name: `${data.first_name} ${data.last_name}`,
        username: data.username,
        work_email: data.work_email,
        job_title: data.job_title,
        department: data.department,
        role: data.role,
        clearance_level: data.clearance_level,
        temporary_password: data.temporary_password
      });

      setIsProvisionModalOpen(false);
      resetForm();
      fetchEmployeesData();
      fetchVaultData();

    } catch (err: unknown) {
      if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('An unexpected error occurred during provisioning.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setWorkEmail('');
    setJobTitle('');
    setCustomPassword('');
    setManagerId(null);
  };

  const handleCopyCredentials = () => {
    if (!slip) return;
    const text = `--- ENTERPRISE CREDENTIAL SLIP ---
Organization: ${user?.tenant_id || 'Enterprise'}
Employee ID: ${slip.employee_number}
Name: ${slip.name}
Work Email: ${slip.work_email}
Username: ${slip.username}
Role: ${slip.role} (${slip.department})
Clearance: ${slip.clearance_level}
Temporary Password: ${slip.temporary_password}
Portal: http://localhost:3000/login
------------------------------------`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleToggleStatus = async (employeeId: number, currentStatus: string) => {
    if (!token) return;
    const nextStatus = currentStatus === 'Active' ? 'OnLeave' : currentStatus === 'OnLeave' ? 'Terminated' : 'Active';
    try {
      const res = await fetch(`/api/employees/${employeeId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        fetchEmployeesData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesDept = selectedDept === 'All' || emp.department === selectedDept;
    const query = searchQuery.toLowerCase();
    const matchesQuery =
      !query ||
      emp.username.toLowerCase().includes(query) ||
      emp.work_email.toLowerCase().includes(query) ||
      (emp.first_name && emp.first_name.toLowerCase().includes(query)) ||
      (emp.last_name && emp.last_name.toLowerCase().includes(query)) ||
      (emp.employee_number && emp.employee_number.toLowerCase().includes(query)) ||
      (emp.job_title && emp.job_title.toLowerCase().includes(query));
    return matchesDept && matchesQuery;
  });

  const filteredVaultItems = vaultItems.filter((item) => {
    const q = vaultSearchQuery.toLowerCase();
    return (
      !q ||
      item.full_name.toLowerCase().includes(q) ||
      item.employee_number.toLowerCase().includes(q) ||
      item.work_email.toLowerCase().includes(q) ||
      item.username.toLowerCase().includes(q) ||
      item.role.toLowerCase().includes(q) ||
      item.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge-cyan uppercase font-mono tracking-wider">
              Tenant: {user?.tenant_id || 'Enterprise'}
            </span>
            <span className="text-xs text-slate-400">• HR Governance Hub</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Employee Directory & Credential Provisioning
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Strict enterprise employee provisioning. Issue secure credentials, map reporting lines, and establish role clearances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/setup-company"
            className="px-4 py-2 border border-cyan-500/20 hover:border-cyan-400/50 bg-[#0c1427]/70 text-slate-300 rounded-lg text-xs font-medium transition-colors"
          >
            ⚙️ Company Settings
          </Link>
          {canManageEmployees && (
            <button
              onClick={() => setIsProvisionModalOpen(true)}
              className="btn-primary-cyan flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <span>+</span>
              <span>Provision New Employee</span>
            </button>
          )}
        </div>
      </div>

      {/* Role-Gated Navigation Tabs (Admin & HR) */}
      {canManageEmployees && (
        <div className="flex items-center gap-3 border-b border-cyan-500/20 pb-4 mb-6">
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'directory'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <span>👥 Staff Directory</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 border border-cyan-500/20 font-mono">
              {employees.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('vault')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'vault'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <span>🔐 Credential Vault (HR Secure)</span>
            {vaultItems.filter(v => v.handout_status === 'Pending Handout').length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/30 text-amber-200 border border-amber-500/50 font-mono animate-pulse">
                {vaultItems.filter(v => v.handout_status === 'Pending Handout').length} Pending
              </span>
            )}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: STAFF DIRECTORY */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'directory' && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="glass-card p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Total Employees</div>
              <div className="text-2xl font-extrabold text-white">{employees.length}</div>
              <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                <span>●</span> {employees.filter(e => e.status === 'Active').length} Active in tenant
              </div>
            </div>

            <div className="glass-card p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Departments</div>
              <div className="text-2xl font-extrabold text-cyan-400">{departments.length}</div>
              <div className="text-[11px] text-slate-400 mt-1">Organized functional units</div>
            </div>

            <div className="glass-card p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Access Method</div>
              <div className="text-sm font-bold text-sky-300 mt-1">Method 2: HR Provisioned</div>
              <div className="text-[11px] text-slate-400 mt-1">Zero open self-registration</div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="glass-card p-4 mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="w-full sm:w-96 relative">
              <input
                type="text"
                placeholder="Search by name, email, employee ID (EMP-xxxx)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#080d1a]/80 border border-cyan-500/20 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <span className="absolute left-3 top-2.5 text-cyan-400 text-xs">🔍</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <label className="text-xs text-slate-400 whitespace-nowrap">Filter Dept:</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-[#080d1a]/80 border border-cyan-500/20 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="All">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Employees Table */}
          <div className="glass-card overflow-hidden shadow-xl">
            {isLoading ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                Loading employee directory...
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                No employees found matching filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#070b14]/80 text-[11px] text-slate-400 uppercase font-mono tracking-wider border-b border-cyan-500/10">
                    <tr>
                      <th className="py-3 px-4">Emp #</th>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Department & Title</th>
                      <th className="py-3 px-4">Role & Clearance</th>
                      <th className="py-3 px-4">Reporting Manager</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/10 font-sans">
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-cyan-950/20 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-cyan-400 font-semibold">
                          {emp.employee_number || `EMP-${String(emp.id).padStart(4, '0')}`}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">
                            {emp.first_name && emp.last_name ? `${emp.first_name} ${emp.last_name}` : emp.username}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">{emp.work_email}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-white font-medium">{emp.department}</div>
                          <div className="text-[11px] text-slate-400">{emp.job_title || 'Specialist'}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-[#080d1a] border border-cyan-500/20 text-slate-300 font-mono text-[10px]">
                              {emp.role}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                              emp.clearance_level === 'ExecutiveOnly' || emp.clearance_level === 'HighlyConfidential'
                                ? 'bg-purple-950/40 border-purple-500/40 text-purple-300'
                                : emp.clearance_level === 'Confidential'
                                ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                                : 'bg-blue-950/40 border-blue-500/40 text-blue-300'
                            }`}>
                              {emp.clearance_level}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300 text-[11px]">
                          {emp.manager_name ? (
                            <span className="flex items-center gap-1">
                              <span>👤</span> {emp.manager_name}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Executive Lead</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            emp.status === 'Active'
                              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                              : emp.status === 'OnLeave'
                              ? 'bg-amber-950/40 text-amber-400 border border-amber-500/30'
                              : 'bg-red-950/40 text-red-400 border border-red-500/30'
                          }`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {emp.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleToggleStatus(emp.id, emp.status)}
                            className="text-[11px] text-cyan-400 hover:text-white border border-cyan-500/30 hover:border-cyan-400 px-2.5 py-1 rounded transition-colors"
                            title="Click to cycle status"
                          >
                            Cycle Status
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: CREDENTIAL VAULT (HR SECURE) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'vault' && canManageEmployees && (
        <div className="space-y-6">
          {/* Security Alert Banner */}
          <div className="glass-card p-5 border border-amber-500/30 bg-amber-950/20 rounded-xl flex items-start gap-3 shadow-lg">
            <span className="text-xl">🔐</span>
            <div>
              <h3 className="text-sm font-bold text-amber-300 tracking-wide">
                Restricted HR Credential Vault (Administrator & Manager Access Only)
              </h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Initial temporary credentials generated during data connector ingestion and manual employee onboarding.
                Credentials must be handed out physically or via secure channels. Once shared with the employee, click 
                <strong className="text-amber-200"> &ldquo;Mark Handed Out&rdquo;</strong> to audit distribution.
              </p>
            </div>
          </div>

          {/* Vault Controls */}
          <div className="glass-card p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="w-full sm:w-96 relative">
              <input
                type="text"
                placeholder="Search vault by name, email, employee ID..."
                value={vaultSearchQuery}
                onChange={(e) => setVaultSearchQuery(e.target.value)}
                className="w-full bg-[#080d1a]/80 border border-cyan-500/20 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <span className="absolute left-3 top-2.5 text-cyan-400 text-xs">🔍</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                Total in Vault: <strong className="text-white">{vaultItems.length}</strong>
              </span>
              <button
                onClick={fetchVaultData}
                className="px-3 py-1.5 rounded-lg border border-cyan-500/20 hover:border-cyan-400 text-slate-300 hover:text-white text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>🔄</span>
                <span>Refresh Vault</span>
              </button>
            </div>
          </div>

          {/* Vault Table */}
          <div className="glass-card overflow-hidden shadow-xl">
            {isVaultLoading ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                Loading credential vault...
              </div>
            ) : filteredVaultItems.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                No credentials found in the vault matching filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#070b14]/80 text-[11px] text-slate-400 uppercase font-mono tracking-wider border-b border-cyan-500/10">
                    <tr>
                      <th className="py-3 px-4">Emp #</th>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Department & Role</th>
                      <th className="py-3 px-4">Clearance</th>
                      <th className="py-3 px-4">Temporary Password</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 px-4">Handout Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-500/10 font-sans">
                    {filteredVaultItems.map((item) => (
                      <tr key={item.id} className="hover:bg-cyan-950/20 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-cyan-400 font-semibold">
                          {item.employee_number}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{item.full_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{item.work_email}</div>
                          <div className="text-[10px] text-slate-500 font-mono">User: {item.username}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-white font-medium">{item.department}</div>
                          <div className="text-[11px] text-cyan-300">{item.role}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                            item.clearance_level === 'ExecutiveOnly' || item.clearance_level === 'HighlyConfidential'
                              ? 'bg-purple-950/40 border-purple-500/40 text-purple-300'
                              : item.clearance_level === 'Confidential'
                              ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                              : 'bg-blue-950/40 border-blue-500/40 text-blue-300'
                          }`}>
                            {item.clearance_level}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#080d1a] border border-amber-500/30 text-amber-200 font-mono text-xs">
                            <span>🔑</span>
                            <span className="font-bold select-all">{item.temporary_password}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[11px] text-slate-400">
                          {item.source}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            item.handout_status === 'Delivered'
                              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-950/40 text-amber-300 border border-amber-500/40 animate-pulse'
                          }`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {item.handout_status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => copyVaultSlip(item)}
                            className="text-[11px] bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 px-2.5 py-1 rounded transition-colors cursor-pointer"
                            title="Copy complete credentials slip"
                          >
                            📋 Copy Slip
                          </button>
                          {item.handout_status !== 'Delivered' && (
                            <button
                              onClick={() => handleMarkDelivered(item.id)}
                              className="text-[11px] bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 px-2.5 py-1 rounded transition-colors cursor-pointer"
                              title="Mark credentials as delivered to staff member"
                            >
                              ✓ Delivered
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PROVISIONING MODAL */}
      {/* ======================================================== */}
      {isProvisionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="glass-panel border-cyan-500/30 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsProvisionModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold"
            >
              ×
            </button>

            <div className="mb-6">
              <span className="badge-cyan uppercase font-mono text-[10px]">
                Method 2: HR Credential Issuance
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight mt-1">
                Provision New Employee Account
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Creates new credentials, assigns role clearance, and generates a printable credential slip.
              </p>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-950/50 border border-red-500/50 rounded text-red-300 text-xs">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleProvisionSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Elena"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-[#080d1a] border border-cyan-500/20 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rostova"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-[#080d1a] border border-cyan-500/20 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Official Work Email *</label>
                <input
                  type="email"
                  required
                  placeholder="elena.rostova@company.com"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  className="w-full bg-[#080d1a] border border-cyan-500/20 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Department *</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-[#080d1a] border border-cyan-500/20 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Job Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lead RF Optimization Engineer"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full bg-[#080d1a] border border-cyan-500/20 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-[#080d1a] border border-cyan-500/20 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  >
                    <option value="Employee">Employee (Operational Staff)</option>
                    <option value="SeniorEngineer">Senior Engineer / Specialist</option>
                    <option value="DeptAdmin">Department Admin / Manager</option>
                    <option value="Auditor">Compliance Auditor</option>
                    <option value="TenantAdmin">Tenant Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Clearance Level *</label>
                  <select
                    value={clearanceLevel}
                    onChange={(e) => setClearanceLevel(e.target.value)}
                    className="w-full bg-[#080d1a] border border-cyan-500/20 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
                  >
                    <option value="Public">Public (Level 1)</option>
                    <option value="Internal">Internal (Level 2)</option>
                    <option value="Restricted">Restricted (Level 3)</option>
                    <option value="Confidential">Confidential (Level 4)</option>
                    <option value="ExecutiveOnly">Executive Only (Level 5)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">Reporting Manager (Optional)</label>
                <select
                  value={managerId || ''}
                  onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full bg-[#080d1a] border border-cyan-500/20 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                >
                  <option value="">None (Reports to Head of Organization)</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.job_title} - {m.department})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase mb-1">
                  Custom Password <span className="text-slate-500">(Leave blank to auto-generate)</span>
                </label>
                <input
                  type="text"
                  placeholder="Auto-generated secure password if blank"
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  className="w-full bg-[#080d1a] border border-cyan-500/20 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>

              <div className="pt-4 border-t border-cyan-500/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsProvisionModalOpen(false)}
                  className="px-4 py-2 border border-slate-700 text-slate-400 hover:text-white rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary-cyan text-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Issuing Credentials...' : 'Issue Credential Slip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CREDENTIAL SLIP MODAL */}
      {/* ======================================================== */}
      {slip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="glass-panel border-cyan-500/50 rounded-2xl max-w-lg w-full p-8 shadow-2xl relative shadow-cyan-950/50">
            <div className="text-center pb-4 border-b border-cyan-500/15">
              <span className="text-2xl">🏛️</span>
              <h2 className="text-xl font-extrabold text-white tracking-tight mt-1">
                Official Credential Slip
              </h2>
              <p className="text-xs text-cyan-400 font-mono">
                {user?.tenant_id || 'Enterprise'} • Secure Employee Handoff
              </p>
            </div>

            <div className="my-6 space-y-3 font-mono text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Employee ID:</span>
                <span className="text-cyan-400 font-bold">{slip.employee_number}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Full Name:</span>
                <span className="text-white font-semibold">{slip.name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Work Email:</span>
                <span className="text-white">{slip.work_email}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Username:</span>
                <span className="text-white">{slip.username}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Department & Title:</span>
                <span className="text-white text-right">{slip.department} ({slip.job_title})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                <span className="text-slate-400">Role & Clearance:</span>
                <span className="text-sky-300">{slip.role} [{slip.clearance_level}]</span>
              </div>

              {/* Password Highlight Box */}
              <div className="mt-4 p-4 bg-[#080d1a] border border-cyan-500/40 rounded-xl">
                <div className="text-[10px] text-cyan-400 font-sans uppercase font-bold tracking-wider mb-1">
                  Temporary Access Password
                </div>
                <div className="text-base font-bold text-white tracking-widest bg-[#05070c] px-3 py-2 rounded border border-cyan-500/20 select-all font-mono">
                  {slip.temporary_password}
                </div>
                <p className="text-[10px] text-slate-400 font-sans mt-2">
                  Share this password securely with the employee. They should sign in at <span className="text-cyan-300">/login</span>.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-cyan-500/15 flex items-center justify-between gap-3">
              <button
                onClick={handleCopyCredentials}
                className="px-5 py-2.5 bg-[#0e1629] hover:bg-[#13203c] text-white border border-cyan-500/20 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span>{copied ? '✓ Copied to Clipboard!' : '📋 Copy Slip Text'}</span>
              </button>

              <button
                onClick={() => setSlip(null)}
                className="btn-primary-cyan text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
