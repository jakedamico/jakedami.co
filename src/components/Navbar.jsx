import /*React,*/ { /*useEffect,*/ useState } from 'react';
import { Link } from 'react-router-dom';

import { tailwindStyles } from '../style'
import { navLinks } from '../constants'
import { JDLogoWhite, menu, close } from '../assets'


const Navbar = () => {  
const [active, setActive] = useState('');
const [toggle, setToggle] = useState(false);

return (
   <nav className={`${tailwindStyles.paddingX} w-full flex 
   items-center py-5 fixed top-0 z-20`}>
      <div className='w-full flex justify-between items-center
      max-w-7xl mx-auto'>
         <Link to="/" className='flex items-center gap-2'
         onClick ={() => {
            setActive("");
            window.scrollTo(0, 0);
         }}>
            <img src={JDLogoWhite} alt="loJDLogoNoBGBlackgo" className='w-9 h-9 object-contain'/>
            <p className='text-white text-[18px] font-bold cursor-pointer flex'>
            Jake D&#39;Amico
            </p>
         </Link>

         {/*desktop nav buttons*/}
         <ul className='list-none hidden sm:flex flex-row gap-10'>
            {navLinks.map((link) => (
               <li key={link.id} 
                  className={`${
                  active === link.title
                  ? "text-white"
                  : "text-secondary"}
                  hover:text-white text-[18px] font-medium cursor-pointer`}
                  onClick={() => setActive(link.title)}>
                  <a className={`squiggle ${active === link.title ? 'animated-squiggle' : ''}`} href={`#${link.id}`}>{link.title}</a>
               </li>
            ))}
         </ul>


         {/*mobile nav menu*/}
         <div className='sm:hidden flex flex-1 justify-end items-center'>
            <img src={toggle ? close : menu} alt="menu" className='w-[28px] h-[28px]
            object-contain cursor-pointer'
            onClick={() => setToggle(!toggle)}/>

            <div className={`${!toggle ? 'hidden' : 'flex'} p-6 black-gradient
            absolute top-20 right-0 mx-4 my-2 win-w-[140px] z-10 rounded-xl`}>
            <ul className='list-none flex justify-end items-start flex-col
            gap-4'>
            {navLinks.map((link) => (
               <li key={link.id} 
                  className={`${
                  active === link.title
                  ? "text-white"
                  : "text-secondary"}
                  font-poppins font-medium cursor-pointer  text-[16px]`}
                  onClick={() => {
                  setToggle(!toggle); 
                  setActive(link.title);}}>
                  <a href={`#${link.id}`}>{link.title}</a>
               </li>
            ))}
            </ul>
            </div>
         </div>
      </div>

   </nav>
)
}

export default Navbar