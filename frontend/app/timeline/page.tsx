"use client";
import { useEffect, useState } from 'react';
import { Clock, CheckCircle, AlertCircle, RefreshCw, Shield, Bell, Calendar } from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: 'discovery' | 'renewal' | 'expiration' | 'alert' | 'error';
  title: string;
  description: string;
  timestamp: string;
  certificateDomain?: string;
  metadata?: any;
}

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch timeline events from backend
    // For now, using mock data
    const mockEvents: TimelineEvent[] = [
      {
        id: '1',
        type: 'discovery',
        title: 'Certificates Discovered',
        description: '55 certificates found in Windows Certificate Store',
        timestamp: new Date().toISOString(),
        metadata: { count: 55, source: 'Windows Certificate Store' }
      },
      {
        id: '2',
        type: 'alert',
        title: 'Certificate Expiring Soon',
        description: 'doxieguard.com expires in 81 days',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        certificateDomain: 'doxieguard.com'
      },
      {
        id: '3',
        type: 'renewal',
        title: 'Certificate Renewed',
        description: 'Successfully renewed certificate for example.com',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        certificateDomain: 'example.com'
      },
      {
        id: '4',
        type: 'expiration',
        title: 'Certificate Expired',
        description: 'test certificate has expired',
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        certificateDomain: 'test'
      },
      {
        id: '5',
        type: 'error',
        title: 'Connection Failed',
        description: 'Could not reach servidor-fantasma-doxie.com',
        timestamp: new Date(Date.now() - 259200000).toISOString(),
        certificateDomain: 'servidor-fantasma-doxie.com'
      }
    ];

    setEvents(mockEvents);
    setLoading(false);
  }, []);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'discovery':
        return <Shield className="w-6 h-6 text-blue-600" />;
      case 'renewal':
        return <RefreshCw className="w-6 h-6 text-green-600" />;
      case 'expiration':
        return <Clock className="w-6 h-6 text-red-600" />;
      case 'alert':
        return <Bell className="w-6 h-6 text-yellow-600" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-600" />;
      default:
        return <CheckCircle className="w-6 h-6 text-gray-600" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'discovery': return 'bg-blue-100 border-blue-200';
      case 'renewal': return 'bg-green-100 border-green-200';
      case 'expiration': return 'bg-red-100 border-red-200';
      case 'alert': return 'bg-yellow-100 border-yellow-200';
      case 'error': return 'bg-red-100 border-red-200';
      default: return 'bg-gray-100 border-gray-200';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading timeline...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Certificate Timeline</h1>
        <p className="text-gray-600">Track all certificate events and changes</p>
      </div>

      {/* Timeline */}
      <div className="max-w-4xl mx-auto">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200"></div>

          {/* Events */}
          <div className="space-y-8">
            {events.map((event, index) => (
              <div key={event.id} className="relative flex gap-6">
                {/* Icon */}
                <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full border-4 border-white ${getEventColor(event.type)}`}>
                  {getEventIcon(event.type)}
                </div>

                {/* Content */}
                <div className="flex-1 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{event.title}</h3>
                      {event.certificateDomain && (
                        <p className="text-sm text-purple-600 font-medium mt-1">
                          {event.certificateDomain}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {formatTimestamp(event.timestamp)}
                    </div>
                  </div>

                  <p className="text-gray-600">{event.description}</p>

                  {event.metadata && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <pre className="text-xs text-gray-600 overflow-x-auto">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {events.length === 0 && (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No events yet</p>
            <p className="text-sm text-gray-400 mt-2">Events will appear here as they occur</p>
          </div>
        )}
      </div>
    </div>
  );
}
