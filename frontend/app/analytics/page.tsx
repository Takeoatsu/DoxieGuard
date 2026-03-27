"use client";
import { useEffect, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Shield, Server, Cloud, Calendar } from 'lucide-react';

interface Certificate {
  id: string;
  domain: string;
  status: string;
  expiresAt: string;
  daysLeft: number;
  healthStatus: string;
  asset?: { name: string };
  cloudProvider?: { provider: string };
}

export default function AnalyticsPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCertificates();
  }, []);

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

  // Prepare data for charts
  const statusData = [
    { name: 'Healthy', value: certificates.filter(c => c.healthStatus === 'HEALTHY').length, color: '#10b981' },
    { name: 'Warning', value: certificates.filter(c => c.healthStatus === 'WARNING').length, color: '#f59e0b' },
    { name: 'Critical', value: certificates.filter(c => c.healthStatus === 'CRITICAL').length, color: '#ef4444' },
    { name: 'Expired', value: certificates.filter(c => c.status === 'EXPIRED').length, color: '#6b7280' },
  ];

  const expirationData = [
    { range: '0-30 days', count: certificates.filter(c => c.daysLeft >= 0 && c.daysLeft <= 30).length },
    { range: '31-60 days', count: certificates.filter(c => c.daysLeft > 30 && c.daysLeft <= 60).length },
    { range: '61-90 days', count: certificates.filter(c => c.daysLeft > 60 && c.daysLeft <= 90).length },
    { range: '90+ days', count: certificates.filter(c => c.daysLeft > 90).length },
  ];

  const sourceData = [
    { source: 'Local', count: certificates.filter(c => !c.cloudProvider).length },
    { source: 'AWS', count: certificates.filter(c => c.cloudProvider?.provider === 'aws').length },
    { source: 'Azure', count: certificates.filter(c => c.cloudProvider?.provider === 'azure').length },
    { source: 'GCP', count: certificates.filter(c => c.cloudProvider?.provider === 'gcp').length },
  ].filter(d => d.count > 0);

  const healthScore = Math.round(
    (certificates.filter(c => c.healthStatus === 'HEALTHY').length / certificates.length) * 100
  ) || 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <TrendingUp className="w-12 h-12 text-purple-600 animate-pulse mx-auto mb-4" />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Certificate Analytics</h1>
        <p className="text-gray-600">Insights and metrics for your certificate infrastructure</p>
      </div>

      {/* Health Score */}
      <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl p-8 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Overall Health Score</h2>
            <p className="text-purple-100">Based on certificate status and expiration dates</p>
          </div>
          <div className="text-center">
            <div className="text-6xl font-bold">{healthScore}%</div>
            <div className="text-purple-100 mt-2">
              {healthScore >= 90 ? '🟢 Excellent' : healthScore >= 70 ? '🟡 Good' : '🔴 Needs Attention'}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Status Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-600" />
            Status Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Expiration Timeline */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-purple-600" />
            Expiration Timeline
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={expirationData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Source Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Cloud className="w-6 h-6 text-purple-600" />
            Certificate Sources
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sourceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="source" type="category" />
              <Tooltip />
              <Bar dataKey="count" fill="#ec4899" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Trend Over Time (Mock data) */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-purple-600" />
            Certificate Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={[
              { month: 'Jan', total: 45, healthy: 40, warning: 3, critical: 2 },
              { month: 'Feb', total: 48, healthy: 42, warning: 4, critical: 2 },
              { month: 'Mar', total: certificates.length, healthy: statusData[0].value, warning: statusData[1].value, critical: statusData[2].value },
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} />
              <Line type="monotone" dataKey="healthy" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="warning" stroke="#f59e0b" strokeWidth={2} />
              <Line type="monotone" dataKey="critical" stroke="#ef4444" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Server className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{certificates.length}</div>
              <div className="text-sm text-gray-600">Total Certificates</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {certificates.filter(c => c.daysLeft > 90).length}
              </div>
              <div className="text-sm text-gray-600">Long-term Valid</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {certificates.filter(c => c.daysLeft < 30).length}
              </div>
              <div className="text-sm text-gray-600">Expiring Soon</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
