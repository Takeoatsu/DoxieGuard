"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutDashboard, TrendingUp, Clock, Settings, Bell } from 'lucide-react';
import Image from 'next/image';

export default function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/analytics', label: 'Analytics', icon: TrendingUp },
    { href: '/timeline', label: 'Timeline', icon: Clock },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-3 mb-8">
        <div className="relative w-10 h-10 rounded-xl overflow-hidden">
          <Image 
            src="/logo-doxie.png" 
            alt="DoxieGuard" 
            fill 
            className="object-cover"
          />
        </div>
        <span className="text-xl font-bold text-gray-900">DoxieGuard</span>
      </Link>

      {/* Navigation Items */}
      <div className="flex-1 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                active
                  ? 'bg-purple-50 text-purple-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Notifications Badge */}
      <div className="mt-auto pt-6 border-t border-gray-200">
        <Link
          href="/notifications"
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50 transition"
        >
          <Bell className="w-5 h-5" />
          <span>Notifications</span>
          <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            3
          </span>
        </Link>
      </div>

      {/* Footer */}
      <div className="mt-4 text-xs text-gray-400 text-center">
        DoxieGuard v1.0.0-alpha
      </div>
    </nav>
  );
}
