"use client";
import { useState } from 'react';
import Image from 'next/image';
import { Shield, Zap, Bell, RefreshCw, Cloud, Lock, CheckCircle, ArrowRight, Download, Star, Menu, X } from 'lucide-react';

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
      // Here you would send to your backend
      console.log('Email submitted:', email);
    }
  };

  const features = [
    {
      icon: <Shield className="w-8 h-8" />,
      title: 'Auto-Discovery',
      description: 'Encuentra automáticamente todos tus certificados SSL/TLS en Linux, Windows, Docker, Kubernetes y más.'
    },
    {
      icon: <Bell className="w-8 h-8" />,
      title: 'Alertas Inteligentes',
      description: 'Recibe notificaciones 90, 30, 15, 7 y 1 día antes de que expiren tus certificados.'
    },
    {
      icon: <RefreshCw className="w-8 h-8" />,
      title: 'Auto-Renewal',
      description: 'Renovación automática con ACME (Let\'s Encrypt) y certificados privados.'
    },
    {
      icon: <Cloud className="w-8 h-8" />,
      title: 'Multi-Cloud',
      description: 'Gestiona certificados en AWS, Azure, GCP y proveedores DNS como Cloudflare.'
    },
    {
      icon: <Lock className="w-8 h-8" />,
      title: 'Enterprise Ready',
      description: 'Soporte para ADCS, VPNs, F5, Fortinet y más infraestructura empresarial.'
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: 'API Potente',
      description: 'Integración completa con webhooks, Slack, Teams y tu infraestructura existente.'
    }
  ];

  const pricing = [
    {
      name: 'PUPPY',
      price: 'Gratis',
      period: 'para siempre',
      features: [
        '3 dominios',
        'Auto-discovery básico',
        'Alertas por email',
        'Dashboard básico'
      ],
      cta: 'Empezar Gratis',
      popular: false
    },
    {
      name: 'PRO',
      price: '$29',
      period: '/mes',
      features: [
        'Dominios ilimitados',
        'Auto-discovery completo',
        'Todas las alertas',
        'Multi-cloud',
        'API + Webhooks',
        'Soporte prioritario'
      ],
      cta: 'Unirse a Alpha',
      popular: true
    },
    {
      name: 'ENTERPRISE',
      price: 'Custom',
      period: '',
      features: [
        'Todo lo de Pro',
        'ADCS + VPNs',
        'F5 + Fortinet',
        'SSO + LDAP',
        'SLA 99.99%',
        'Support dedicado'
      ],
      cta: 'Contactar Sales',
      popular: false
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl shadow-lg overflow-hidden">
                <Image 
                  src="/logo-doxie.png" 
                  alt="DoxieGuard" 
                  fill 
                  className="object-cover"
                />
              </div>
              <span className="text-xl font-bold text-gray-900">DoxieGuard</span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition">Features</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition">Pricing</a>
              <a href="#docs" className="text-gray-600 hover:text-gray-900 transition">Docs</a>
              <a href="#alpha" className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-5 py-2 rounded-full font-medium hover:shadow-lg transition">
                Probar Alpha
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4">
            <div className="flex flex-col gap-4">
              <a href="#features" className="text-gray-600">Features</a>
              <a href="#pricing" className="text-gray-600">Pricing</a>
              <a href="#docs" className="text-gray-600">Docs</a>
              <a href="#alpha" className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-5 py-2 rounded-full font-medium text-center">
                Probar Alpha
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Star className="w-4 h-4" />
            Ahora en Alpha - Únete a cientos de DevOps
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            Gestión Inteligente de
            <br />
            <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Certificados SSL/TLS
            </span>
          </h1>

          <p className="text-xl text-gray-600 mb-10 max-w-3xl mx-auto">
            DoxieGuard descubre, monitorea y renueva automáticamente todos tus certificados. 
            Zero intervention, 100% peace of mind. 🐾
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <a href="#alpha" className="group bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-full font-medium text-lg hover:shadow-xl transition flex items-center gap-2">
              <Download className="w-5 h-5" />
              Descargar Alpha Client
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition" />
            </a>
            <a href="#demo" className="text-gray-700 px-8 py-4 rounded-full font-medium text-lg border-2 border-gray-200 hover:border-purple-300 transition">
              Ver Demo en Vivo
            </a>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            <div>
              <div className="text-4xl font-bold text-purple-600">55+</div>
              <div className="text-gray-600">Certificados Descubiertos</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-600">100%</div>
              <div className="text-gray-600">Auto-Renewal</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-600">5min</div>
              <div className="text-gray-600">Setup Time</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-600">24/7</div>
              <div className="text-gray-600">Monitoring</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Todo lo que necesitas
            </h2>
            <p className="text-xl text-gray-600">
              Una plataforma completa para gestionar certificados en cualquier entorno
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="group p-8 rounded-3xl border-2 border-gray-100 hover:border-purple-200 transition-all hover:shadow-xl">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-2xl flex items-center justify-center text-purple-600 mb-6 group-hover:scale-110 transition">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-purple-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Funciona en 3 simples pasos
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6">
                1
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Descarga el Agent</h3>
              <p className="text-gray-600">
                Descarga e instala DoxieGuard Agent en tu servidor. Solo 10MB, zero dependencies.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6">
                2
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Auto-Discovery</h3>
              <p className="text-gray-600">
                El agent encuentra automáticamente todos tus certificados en segundos.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6">
                3
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Relax 🐾</h3>
              <p className="text-gray-600">
                DoxieGuard monitorea, alerta y renueva automáticamente. Tú solo relájate.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Alpha Signup */}
      <section id="alpha" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-purple-600 to-pink-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            🚀 Únete al Programa Alpha
          </h2>
          <p className="text-xl text-purple-100 mb-10">
            Sé de los primeros en usar DoxieGuard. Acceso gratuito de por vida para alpha testers.
          </p>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="max-w-md mx-auto">
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 px-6 py-4 rounded-full text-gray-900 focus:outline-none focus:ring-4 focus:ring-purple-300"
                  required
                />
                <button
                  type="submit"
                  className="bg-white text-purple-600 px-8 py-4 rounded-full font-medium hover:shadow-xl transition flex items-center gap-2"
                >
                  Unirse
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
              <p className="text-purple-200 text-sm mt-4">
                Sin spam, solo updates importantes del producto.
              </p>
            </form>
          ) : (
            <div className="bg-white/20 backdrop-blur-sm rounded-3xl p-8">
              <CheckCircle className="w-16 h-16 text-white mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white mb-2">¡Genial! 🎉</h3>
              <p className="text-purple-100">
                Te enviaremos el link de descarga cuando esté listo.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600">
              Empieza gratis, escala cuando necesites
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {pricing.map((plan, index) => (
              <div 
                key={index} 
                className={`relative p-8 rounded-3xl border-2 ${
                  plan.popular 
                    ? 'border-purple-500 shadow-2xl scale-105' 
                    : 'border-gray-200'
                } bg-white`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                    Más Popular
                  </div>
                )}

                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-5xl font-bold text-gray-900">{plan.price}</span>
                  {plan.period && <span className="text-gray-600 ml-2">{plan.period}</span>}
                </div>

                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <a 
                  href="#alpha" 
                  className={`block text-center py-4 rounded-full font-medium transition ${
                    plan.popular
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-xl'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative w-10 h-10 rounded-xl overflow-hidden">
                  <Image 
                    src="/logo-doxie.png" 
                    alt="DoxieGuard" 
                    fill 
                    className="object-cover"
                  />
                </div>
                <span className="text-xl font-bold">DoxieGuard</span>
              </div>
              <p className="text-gray-400">
                Smart Certificate Management for modern infrastructure.
              </p>
            </div>

            <div>
              <h4 className="font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#alpha" className="hover:text-white transition">Alpha Program</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#docs" className="hover:text-white transition">Documentation</a></li>
                <li><a href="#api" className="hover:text-white transition">API Reference</a></li>
                <li><a href="#status" className="hover:text-white transition">Status Page</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#about" className="hover:text-white transition">About</a></li>
                <li><a href="#blog" className="hover:text-white transition">Blog</a></li>
                <li><a href="#contact" className="hover:text-white transition">Contact</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">
              © 2026 DoxieGuard. All rights reserved.
            </p>
            <div className="flex gap-6 text-gray-400 text-sm">
              <a href="#privacy" className="hover:text-white transition">Privacy</a>
              <a href="#terms" className="hover:text-white transition">Terms</a>
              <a href="#security" className="hover:text-white transition">Security</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
