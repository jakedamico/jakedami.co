import React from 'react'
import { motion } from 'framer-motion'

import { tailwindStyles } from '../style'
import { ComputersCanvas, MatterDisplay } from './canvas'

const Hero = () => {
return (
   <section className="relative w-full h-screen mx-auto">
      <div className="absolute inset-0 z-10">
        <MatterDisplay /> {/* Overlaying other content */}
      </div>
      <div className={`absolute inset-0 top-[120px] max-w-7xl mx-auto flex
      flex-row items-start gap-5`}>
      <div className='flex flex-col justify-center items-center mt-5'>
         {/*dot*/}
         <div className='w-5 h-5 rounded-full bg-[#79B4A9]'/>
         {/*line*/}
         <div className='w-1 sm:h-80 h-40 teal-gradient'/>
      </div>

         {/*text*/}
      <div>
         <h1 className={`${tailwindStyles.heroHeadText}`}>
            Hi, I&#39;m <span className='text-[#79B4A9]'>Jake</span>
         </h1>
         <p className={`${tailwindStyles.heroSubText} mt-2 text-white-100`}>
            Welcome to my portfolio, I <br className='sm:block hidden' />
            need to put some text here!
         </p>
      </div>
      </div>
      {/*3d model*/}

      <div className='absolute xs:bottom-10 bottom-32 w-full flex
      justify-center items-center'>
      <a href="#about">
         <div className='w-[35px] h-[64px] rounded-3xl border-4
         border-secondary flex justify-center items-start p-2'>
            <motion.dev 
            animate={{
               y: [0, 24, 0]
            }}
            transition={{
               duration: 1.5,
               repeat: Infinity,
               repeatType: 'loop'
            }}
            className='w-3 h-3 rounded-full bg-secondary mb-1'/>
         </div>
      </a>
      </div>
   </section>
)
}

export default Hero