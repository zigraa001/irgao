import React from 'react';
import { Star, Quote } from 'lucide-react';
import Card from '@/components/Card';

const TestimonialCard = ({ testimonial }) => {
  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-3xl">
          {testimonial.image}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white font-poppins">
            {testimonial.name}
          </h3>
          <p className="text-gray-400 text-sm font-inter">
            {testimonial.role}
          </p>
          <p className="text-gray-500 text-sm font-inter">
            {testimonial.organization}
          </p>
        </div>
      </div>
      
      <div className="flex gap-1 mb-4">
        {[...Array(testimonial.rating)].map((_, i) => (
          <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />
        ))}
      </div>
      
      <div className="relative mb-4 flex-1">
        <Quote className="absolute -top-2 -left-2 w-8 h-8 text-amber-500/20" />
        <p className="text-gray-300 italic font-inter leading-relaxed pl-6">
          "{testimonial.quote}"
        </p>
      </div>
      
      <div className="pt-4 border-t border-slate-700">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-orange-600/20 px-4 py-2 rounded-lg">
          <span className="text-amber-400 font-bold text-sm font-inter">
            Impact: {testimonial.impact}
          </span>
        </div>
      </div>
    </Card>
  );
};

export default TestimonialCard;