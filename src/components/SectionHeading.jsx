import React from 'react';
import { motion } from 'framer-motion';

const SectionHeading = ({ title, subtitle }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="text-center mb-12"
    >
      <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-poppins">
        {title}
      </h2>
      {subtitle && (
        <p className="text-xl text-gray-300 max-w-3xl mx-auto font-inter">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
};

export default SectionHeading;