import { VerticalTimeline, 
  VerticalTimelineElement } from "react-vertical-timeline-component"
import { motion } from 'framer-motion'

import 'react-vertical-timeline-component/style.min.css'

import { tailwindStyles } from "../style"
import { experiences } from '../constants'
import { SectionWrapper } from "../higher order components"
import { textVariant } from "../utils/motion"
import { MatterDisplayTimeline } from "./canvas"

const ExperienceCard = ({ experience, index }) => {
   const colors = ['#8377D1', '#EE4266', '#9CC69B', '#79B4A9'];
   const backgroundColor = colors[index % colors.length]; // Cycle through the colors
 
   return (
     <VerticalTimelineElement
       contentStyle={{ background: backgroundColor, color: '#fff' }}
       contentArrowStyle={{ borderRight: `7px solid ${backgroundColor}` }}
       date={experience.date}
       iconStyle={{ background: experience.iconBg }}
       icon={
         <div className="flex justify-center items-center w-full h-full">
           <img src={experience.icon} alt={experience.company_name}
           className="w-[60%] h-[60%] object-contain"/>
         </div>
       }
     >
    <div>
      <h3 className="text-white text-[24px] font-bold">
        {experience.title}
      </h3>
      <p className="text-secondary text-[16px] font-semibold">
        {experience.company_name}
      </p>
    </div>

    <ul className="mt-5 list-disc ml-5 space-y-2">
      {experience.points.map((point, index) => (
        <li key={`experience-point-${index}`} className="text-white-100 text-[14px]
        pl-1 tracking-wider">
          {point}
        </li>
      ))}
    </ul>
  </VerticalTimelineElement>
)}
const Experience = () => {
  return (
    <>
      <div className="absolute inset-0 z-10 pointer-events-none">
        <MatterDisplayTimeline /> {/* Overlaying other content */}
      </div>
      <motion.div variants={textVariant()}>
        <p className={tailwindStyles.sectionSubText}>
          What I have done so far
        </p>
        <h2 className={tailwindStyles.sectionHeadText}>
          Work Experience
        </h2>
      </motion.div>

      <div className="mt-20 flex flex-col">
        <VerticalTimeline animate={false}>
         {experiences.map((experience, index) => (
               <ExperienceCard key={experience.id} experience={experience} index={index} />
            ))}
        </VerticalTimeline>
      </div>
    </>
  )
}

export default SectionWrapper(Experience, 'work')