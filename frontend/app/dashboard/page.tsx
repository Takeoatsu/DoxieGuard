"use client";
import { useEffect, useState } from 'react';
import { Shield, ShieldAlert, Search, Filter, Download, RefreshCw, Calendar, Server, AlertCircle } from 'lucide-react';

interface Certificate {
  id: string;
  domain: string;
  status: string;
  expiresAt: string;
  daysLeft: number;
  healthStatus: string;
  asset?: {
    name: string;
  };
  cloudProvider?: {
    provider: string;
    name: string;
  };
}

export default function DashboardPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [filteredCerts, setFilteredCerts] = useState<Certificate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCertificates();
  }, []);

  useEffect(() => {
    filterCertificates();
  }, [certificates, searchTerm, statusFilter]);

  const fetchCertificates = async () => {
    try {
      const response = await fetch('http://localhost:5000/certificates');
      const data = await response.json();
      setCertificates(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching certificates:', error);
      setLoading(false);
    }
  };

  const filterCertificates = () => {
    let filtered = certificates;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(cert =>
        cert.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cert.asset?.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(cert => cert.healthStatus === statusFilter || cert.status === statusFilter);
    }

    setFilteredCerts(filtered);
  };

  const exportToCSV = () => {
    const headers = ['Domain', 'Status', 'Expires At', 'Days Left', 'Asset', 'Health Status'];
    const rows = filteredCerts.map(cert => [
      cert.domain,
      cert.status,
      new Date(cert.expiresAt).toLocaleDateString(),
      cert.daysLeft,
      cert.asset?.name || 'N/A',
      cert.healthStatus
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doxieguard-certificates-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportToJSON = () => {
    const jsonContent = JSON.stringify(filteredCerts, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doxieguard-certificates-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HEALTHY': return 'bg-green-100 text-green-800';
      case 'WARNING': return 'bg-yellow-100 text-yellow-800';
      case 'CRITICAL': return 'bg-red-100 text-red-800';
      case 'EXPIRED': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'HEALTHY': return <Shield className="w-5 h-5 text-green-600" />;
      case 'WARNING': return <ShieldAlert className="w-5 h-5 text-yellow-600" />;
      case 'CRITICAL': return <AlertCircle className="w-5 h-5 text-red-600" />;
      default: return <Shield className="w-5 h-5 text-gray-600" />;
    }
  };

  const stats = {
    total: certificates.length,
    healthy: certificates.filter(c => c.healthStatus === 'HEALTHY').length,
    warning: certificates.filter(c => c.healthStatus === 'WARNING').length,
    critical: certificates.filter(c => c.healthStatus === 'CRITICAL' || c.status === 'EXPIRED').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading certificates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Certificate Dashboard</h1>
        <p className="text-gray-600">Monitor and manage all your SSL/TLS certificates</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-medium">Total Certificates</span>
            <Server className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-medium">Healthy</span>
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-3xl font-bold text-green-600">{stats.healthy}</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-medium">Warning</span>
            <ShieldAlert className="w-5 h-5 text-yellow-600" />
          </div>
          <div className="text-3xl font-bold text-yellow-600">{stats.warning}</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm font-medium">Critical</span>
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div className="text-3xl font-bold text-red-600">{stats.critical}</div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by domain or asset..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">All Status</option>
              <option value="HEALTHY">Healthy</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-2">
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={exportToJSON}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
            >
              <Download className="w-4 h-4" />
              JSON
            </button>
            <button
              onClick={fetchCertificates}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Certificates Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Domain
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Asset
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Days Left
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Health
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCerts.map((cert) => (
                <tr key={cert.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusIcon(cert.healthStatus || cert.status)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{cert.domain}</div>
                    {cert.cloudProvider && (
                      <div className="text-xs text-gray-500 mt-1">
                        {cert.cloudProvider.provider.toUpperCase()} - {cert.cloudProvider.name}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{cert.asset?.name || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {new Date(cert.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">
                      {cert.daysLeft} days
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(cert.healthStatus || cert.status)}`}>
                      {cert.healthStatus || cert.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCerts.length === 0 && (
          <div className="text-center py-12">
            <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No certificates found</p>
            <p className="text-sm text-gray-400 mt-2">Try adjusting your filters or search term</p>
          </div>
        )}
      </div>

      {/* Pagination (placeholder) */}
      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Showing {filteredCerts.length} of {certificates.length} certificates
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-sm">
            Previous
          </button>
          <button className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-sm">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
