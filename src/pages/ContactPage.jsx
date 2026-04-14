import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import Card from '@/components/Card';
import SectionHeading from '@/components/SectionHeading';
import GradientBackground from '@/components/GradientBackground';
import { Checkbox } from '@/components/ui/checkbox';

const ContactPage = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    organization: '',
    serviceType: '',
    message: '',
    newsletter: false
  });

  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
       ...prev, 
       [name]: type === 'checkbox' ? checked : value 
    }));
    
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleCheckboxChange = (checked) => {
     setFormData(prev => ({ ...prev, newsletter: checked }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    if (!formData.serviceType) newErrors.serviceType = 'Please select a service type';
    if (!formData.message.trim()) newErrors.message = 'Message is required';
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toast({
        title: 'Validation Error',
        description: 'Please check the form for errors.',
        variant: 'destructive'
      });
      return;
    }

    const submissions = JSON.parse(localStorage.getItem('contactSubmissions') || '[]');
    submissions.push({ ...formData, timestamp: new Date().toISOString() });
    localStorage.setItem('contactSubmissions', JSON.stringify(submissions));

    toast({
      title: 'Message Sent Successfully!',
      description: 'We will respond within 24 hours.',
    });

    setFormData({
      fullName: '',
      email: '',
      phone: '',
      organization: '',
      serviceType: '',
      message: '',
      newsletter: false
    });
  };

  return (
    <>
      <Helmet>
        <title>Contact SkyMed - Request Emergency Air Medical Services</title>
        <meta name="description" content="Contact SkyMed for emergency air medical transport services. Available 24/7." />
      </Helmet>

      {/* Hero Section */}
      <section className="relative min-h-[40vh] flex items-center justify-center overflow-hidden">
        <GradientBackground
          imageUrl="https://images.unsplash.com/photo-1649260257572-91bf6f94cff6"
          gradientFrom="rgba(15, 23, 42, 0.7)"
          gradientTo="rgba(15, 23, 42, 0.9)"
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-12 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-6xl font-bold text-white mb-4 font-poppins"
          >
            Get In Touch
          </motion.h1>
          <motion.p 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.1 }}
             className="text-xl text-gray-300 font-inter"
          >
             We are here to help 24/7/365
          </motion.p>
        </div>
      </section>

      <section className="py-16 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12">
            
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="p-8 bg-slate-800 border-slate-700">
                <h2 className="text-2xl font-bold text-white mb-6 font-poppins">Send us a Message</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Name *</label>
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        className={`w-full px-4 py-3 bg-slate-900 border ${errors.fullName ? 'border-red-500' : 'border-slate-700'} rounded-lg text-white focus:ring-2 focus:ring-amber-500 outline-none transition-all`}
                        placeholder="Your Name"
                      />
                      {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Email *</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className={`w-full px-4 py-3 bg-slate-900 border ${errors.email ? 'border-red-500' : 'border-slate-700'} rounded-lg text-white focus:ring-2 focus:ring-amber-500 outline-none transition-all`}
                        placeholder="email@example.com"
                      />
                      {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Phone *</label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className={`w-full px-4 py-3 bg-slate-900 border ${errors.phone ? 'border-red-500' : 'border-slate-700'} rounded-lg text-white focus:ring-2 focus:ring-amber-500 outline-none transition-all`}
                        placeholder="+91..."
                      />
                      {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Organization</label>
                      <input
                        type="text"
                        name="organization"
                        value={formData.organization}
                        onChange={handleChange}
                        className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                        placeholder="Company/Hospital"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Service Type *</label>
                    <select
                      name="serviceType"
                      value={formData.serviceType}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 bg-slate-900 border ${errors.serviceType ? 'border-red-500' : 'border-slate-700'} rounded-lg text-white focus:ring-2 focus:ring-amber-500 outline-none transition-all`}
                    >
                      <option value="">Select Service...</option>
                      <option value="Emergency Response">Emergency Response</option>
                      <option value="Inter-facility Transport">Inter-facility Transport</option>
                      <option value="Partnership">Partnership Inquiry</option>
                      <option value="General">General Inquiry</option>
                    </select>
                    {errors.serviceType && <p className="text-red-500 text-xs mt-1">{errors.serviceType}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Message *</label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      rows={4}
                      className={`w-full px-4 py-3 bg-slate-900 border ${errors.message ? 'border-red-500' : 'border-slate-700'} rounded-lg text-white focus:ring-2 focus:ring-amber-500 outline-none transition-all resize-none`}
                      placeholder="How can we help you?"
                    />
                    {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message}</p>}
                  </div>

                   <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="newsletter" 
                        checked={formData.newsletter}
                        onCheckedChange={handleCheckboxChange}
                        className="border-slate-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      />
                      <label
                        htmlFor="newsletter"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-300"
                      >
                        Subscribe to our newsletter for updates
                      </label>
                    </div>

                  <Button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all">
                    Send Message
                  </Button>
                </form>
              </Card>
            </motion.div>

            {/* Contact Info */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
               <div>
                  <h2 className="text-3xl font-bold text-white mb-6 font-poppins">Contact Information</h2>
                  <p className="text-gray-300 mb-8 font-inter">
                     Whether you have a question about our services, pricing, or need immediate assistance, our team is ready to answer all your questions.
                  </p>
                  
                  <div className="space-y-6">
                     <Card className="flex items-center gap-4 p-6 bg-slate-800/50 hover:bg-slate-800 transition-colors cursor-pointer">
                        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                           <Phone className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                           <p className="text-sm text-gray-400">Emergency Hotline (24/7)</p>
                           <p className="text-xl font-bold text-white">+91 1800-SKYMED</p>
                        </div>
                     </Card>

                     <Card className="flex items-center gap-4 p-6 bg-slate-800/50 hover:bg-slate-800 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                           <Mail className="w-6 h-6 text-amber-500" />
                        </div>
                        <div>
                           <p className="text-sm text-gray-400">Email Us</p>
                           <p className="text-xl font-bold text-white">emergency@skymed.in</p>
                        </div>
                     </Card>

                     <Card className="flex items-center gap-4 p-6 bg-slate-800/50 hover:bg-slate-800 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                           <MapPin className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                           <p className="text-sm text-gray-400">Headquarters</p>
                           <p className="text-lg font-bold text-white">Andheri East, Mumbai, India</p>
                        </div>
                     </Card>
                  </div>
               </div>

               {/* Guarantee Box */}
               <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full -mr-16 -mt-16 blur-xl"></div>
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                     <Clock className="w-5 h-5 text-amber-500" />
                     Response Guarantee
                  </h3>
                  <p className="text-gray-300 text-sm">
                     We guarantee rapid deployment within minutes of confirmation. Our operations center monitors all flights 24/7 to ensure safety and speed.
                  </p>
               </div>

               {/* Map Placeholder */}
               <div className="w-full h-64 bg-slate-800 rounded-xl overflow-hidden border border-slate-700 relative flex items-center justify-center group">
                  <div className="absolute inset-0 bg-slate-900/50 z-10 group-hover:bg-slate-900/30 transition-colors"></div>
                  <img src="https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?auto=format&fit=crop&q=80" alt="Map Location" className="absolute inset-0 w-full h-full object-cover opacity-50" />
                  <div className="relative z-20 text-center">
                     <MapPin className="w-10 h-10 text-amber-500 mx-auto mb-2 animate-bounce" />
                     <span className="text-white font-bold bg-slate-900/80 px-4 py-2 rounded-full text-sm">View on Google Maps</span>
                  </div>
               </div>

            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
};

export default ContactPage;