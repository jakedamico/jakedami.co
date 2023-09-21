import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import emailjs from '@emailjs/browser'

import { tailwindStyles } from '../style'
import { EarthCanvas } from './canvas'
import { SectionWrapper } from '../higher order components'
import { slideIn } from '../utils/motion'

//service_arp2ifb yaikp-qA97XgXGuaH template_wpwvoeo

const Contact = () => {
  const formRef = useRef();
  const [form, setForm] = useState({
    name: '',
    email: '',
    message: '',
  })
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm({ ...form, [name]: value })
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);

    emailjs.send(
      'service_arp2ifb', 
      'template_wpwvoeo', 
      {
        from_name:form.name,
        to_name: 'Jake',
        from_email: form.email,
        to_email: 'jakedamico34@gmail.com',
        message: form.message
      },
      'yaikp-qA97XgXGuaH'
      ).then(() => {
          setLoading(false);
          alert("Thanks! I'll get back to you as soon as possible.");
          setForm({
            name:'',
            email: '',
            message: ''
          });
      }, (error) => {
          setLoading(false);
          console.log(error)
          alert('Something went wrong, sorry!')
      })
  }


  return (
    <div className='xl:mt-12 xl:flex-row flex-col-reverse flex gap-10 
    overflow-hidden'>
      <motion.div variants={slideIn('left', "tween", 0.2, 1)}
      className="flex-[0.75] bg-black-100 p-8 rounded-2xl">
        <p className={tailwindStyles.sectionSubText}>
          Shoot me an email
        </p>
        <h3 className={tailwindStyles.sectionHeadText}>
          Contact
        </h3>

        <form ref={formRef} onSubmit={handleSubmit} className='mt-12 flex flex-col
        gap-8'>
          {/*name*/}
          <label className='flex flex-col'>
            <span className='text-white font-medium mb-4'>
              Your Name
            </span>
            <input type="text" name="name" value={form.name} onChange={handleChange}
            placeholder='Your name' className='bg-tertiary py-4 px-6 
            placeholder:text-secondary text-white rounded-lg outlined-none border-none
            font-medium'>
            </input>
          </label>

          {/*email*/}
          <label className='flex flex-col'>
            <span className='text-white font-medium mb-4'>
              Your email
            </span>
            <input type="email" name="email" value={form.email} onChange={handleChange}
            placeholder='Your email' className='bg-tertiary py-4 px-6 
            placeholder:text-secondary text-white rounded-lg outlined-none border-none
            font-medium'>
            </input>
          </label>


          {/*message*/}
          <label className='flex flex-col'>
            <span className='text-white font-medium mb-4'>
              Your message
            </span>
            <textarea name="message" value={form.message} onChange={handleChange}
            rows="7" placeholder='Your message' className='bg-tertiary py-4 px-6 
            placeholder:text-secondary text-white rounded-lg outlined-none border-none
            font-medium'>
            </textarea>
          </label>

          {/*submit button*/}
          <button type="submit" className='bg-tertiary py-3 px-8 outline-none
          w-fit text-white font-bold shadow-md shadow-primary rounded-xl'>
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </motion.div>

      <motion.div variants={slideIn('right', "tween", 0.2, 1)}
      className='xl:flex-1 xl:h-auto md:h-[550px] h-[350px]'>
        <EarthCanvas />
      </motion.div>
    </div>
  )
}

export default SectionWrapper(Contact, "contact")