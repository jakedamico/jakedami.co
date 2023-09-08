import React from 'react'
import { Tilt } from 'react-tilt'
import { motion } from 'framer-motion'

import { tailwindStyles } from '../style' 
import { services } from '../constants'
import { fadeIn, textVariant } from '../utils/motion'
import { SectionWrapper } from '../higher order components'

const ServiceCard = ({ index, title, icon }) => {
  return (
    <Tilt className="xs:w-[250px] w-full">
      <motion.div variants={fadeIn("right", "spring", 0.5 * index, 0.75)}
      className='w-full green-pink-gradient p-[1px] rounded-[20px] shadow-card'>
        <div options={{max: 45, scale: 1, speed: 450}} className='bg-tertiary
        rounded-[20px] py-5 px-12 min-h-[280px] flex justify-evenly items-center
        flex-col'>
          <img src={icon} alt={title} className='w-16 h-16 object-contain'/>
          <h3 className='text-white text-[20px] font-bold text-center'>
            {title}
          </h3>
        </div>
      </motion.div>
    </Tilt>
  )
}

const About = () => {
  return (
    <>
      <motion.div variants={textVariant()}>
        <p className={tailwindStyles.sectionSubText}>Introduction</p>
        <h2 className={tailwindStyles.sectionHeadText}>Overview.</h2>
      </motion.div>

      <motion.p variants={fadeIn("", "", 0.1, 1)} className='mt-4 text-secondary
      text-[17px] max-w-3xl leading-[30px]'>
      Hello! I'm Jake, a dedicated software engineer hailing from Ohio. My journey in 
      the tech world is fueled by an unwavering passion for web development, 
      application engineering, and the intriguing realm of computer vision. 
      As I dive deeper into these areas, I'm constantly inspired by the possibilities 
      and challenges they present. Together, they shape my perspective and drive as 
      a modern engineer, ready to explore and innovate.
      </motion.p>

      <div className='mt-20 flex flex-wrap gap-10'>
        {services.map((service, index) => (
          <ServiceCard key={service.title} index={index} {...service} />
        ))}
      </div>
    </>
  )
}

export default SectionWrapper(About, "about")