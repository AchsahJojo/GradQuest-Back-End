
def school13():
    adm = "https://electrical.sdsu.edu/programs/graduate/admission"
    ov = "https://electrical.sdsu.edu/programs/graduate/ms-computer-engineering"
    fac = "https://electrical.sdsu.edu/people/faculty"
    gp = "https://electrical.sdsu.edu/programs/graduate"
    guide = "https://electrical.sdsu.edu/_resources/files/guidelineforcourses-ece-5-11-26.pdf"
    hb = "https://electrical.sdsu.edu/_resources/files/graduatehandbook-fa25.pdf"
    uni = "https://admissions.sdsu.edu/grad-programs/masters"
    pages = [
        {"kind": "overview", "url": ov},
        {"kind": "overview", "url": gp},
        {"kind": "admissions", "url": adm},
        {"kind": "admissions", "url": uni},
        {"kind": "curriculum", "url": ov},
        {"kind": "curriculum", "url": guide},
        {"kind": "faculty", "url": fac},
        {"kind": "faculty", "url": hb},
        {"kind": "deadlines", "url": adm},
        {"kind": "deadlines", "url": uni},
    ]
    facts = [
        F("overview", "Program and specializations",
          "ECE department MSCompE page: specializations include VLSI systems, computer networks, embedded systems, machine learning, and scientific computing.",
          ov, "The areas of specialization include (but are not limited to) VLSI Systems, Computer Networks, Embedded Systems, Machine Learning and Scientific Computing."),
        F("requirement", "30 units, Plan A or Plan B",
          "Each student must complete 30 units under Plan A (thesis) or Plan B (project).",
          ov, "Each student must complete 30 units either by selecting Plan A (Thesis) or Plan B (Project)."),
        F("requirement", "600/700-level unit split",
          "Eighteen of the 30 units should be 600- and 700-numbered courses; the remaining 12 may be 500-, 600-, or 700-level department courses.",
          ov, "Eighteen of the thirty units should be 600 and 700-numbered courses. The remaining twelve units can be from 500, 600 or 700-level courses offered by the department."),
        F("requirement", "Outside-department course limit",
          "No more than two courses may be taken from other College of Engineering or College of Sciences departments, with prior Graduate Advisor approval.",
          ov, "No more than two courses can be taken from other departments in the College of Engineering or from the College of Sciences to satisfy these requirements, with the prior approval of the Graduate Advisor."),
        F("requirement", "Minimum 3.0 GPA to complete the degree",
          "A minimum average GPA of 3.0 is required to complete the degree.",
          ov, "A minimum average GPA of 3.0 is required to successfully complete the degree."),
        F("requirement", "Plan A thesis units",
          "Plan A: 21 units of coursework, 6 units of COMPE 797 Research, and 3 units of COMPE 799A Thesis.",
          ov, "Students opting for Plan A must complete 21 units of course work (7 courses), 6 units of COMPE 797 \"Research\" (typically as two 3-unit COMPE 797 “Research”, taken in two different semesters) and 3 units of COMPE 799A \"Thesis\" under supervision of a full-time ECE faculty."),
        F("requirement", "Plan B project units",
          "Plan B: at least 18 units of depth-area courses and 3 units of COMPE 798 as the project.",
          ov, "Students opting for Plan B or the Project option are required to pick an area of specialization and complete a minimum of 18 units of “Depth Area Courses” and 3 units of COMPE 798 as the project."),
        F("requirement", "International in-person enrollment",
          "International students needing an I-20 must enroll in at least 6 units of in-person instruction per semester and may not take more than 3 units fully online.",
          ov, "International Students requiring an I-20 immigration document from SDSU must be enrolled in a minimum of 6 units of in-person course instruction on campus, per semester. International students may not take more than 3 units of fully online course instruction, per semester."),
        F("course", "Computer Networks core options",
          "May 11, 2026 course-guidelines PDF, CompE table: Computer Networks core may be COMPE 560, EE 602, or EE 603.",
          guide, "Computer Networks COMPE 560: Computer Networks or EE 602: Stochastic Systems or EE 603: Engineering Optimization"),
        F("course", "Embedded Systems core",
          "Course-guidelines PDF: Embedded Systems core is COMPE 571 Embedded Operating Systems.",
          guide, "Embedded Systems COMPE 571: Embedded Operating Systems"),
        F("course", "Machine Learning and Scientific Computing core",
          "Course-guidelines PDF: core course is COMPE 510 Machine Learning for Engineering.",
          guide, "Machine Learning and Scientific Computing COMPE 510: Machine Learning for Engineering"),
        F("course", "VLSI Systems core",
          "Course-guidelines PDF: VLSI Systems core is COMPE 572 VLSI Circuit Design.",
          guide, "VLSI Systems COMPE 572: VLSI Circuit Design"),
        F("course", "COMPE 560",
          "Tentative fall list in the course-guidelines PDF includes COMPE560 Computer and Data Networks.",
          guide, "COMPE560 Computer and Data Networks"),
        F("course", "COMPE 510",
          "Tentative fall list includes COMPE510 Machine Learning for Engineering.",
          guide, "COMPE510 Machine Learning for Engineering"),
        F("course", "COMPE 571",
          "Tentative fall list includes COMPE571 Embedded Operating System.",
          guide, "COMPE571 Embedded Operating System"),
        F("course", "COMPE 572",
          "The PDF lists COMPE572 VLSI Circuit Design in both the fall and spring tentative schedules.",
          guide, "COMPE572 VLSI Circuit Design"),
        F("course", "COMPE 525",
          "Tentative spring list includes COMPE525 Cyber Physical Systems.",
          guide, "COMPE525 Cyber Physical Systems"),
        F("requirement", "Five 500-level courses allowed for MSCOMPE",
          "Course-guidelines instructions: four 500-level courses are accepted for MSEE and five are allowed for MSCOMPE.",
          guide, "Four 500-level courses are accepted for the MSEE graduate program and five are allowed for the MSCOMPE program."),
        F("requirement", "Domestic classified admission",
          "Department admission page (covers MSEE and MSCompE): domestic classified standing requires a bachelor's in Electrical or Computer Engineering from an ABET-accredited U.S. program and a 2.85 GPA in the last 60 semester (90 quarter) units of technical coursework.",
          adm, "Bachelor's degree in Electrical or Computer Engineering from an ABET accredited engineering program in the USA."),
        F("requirement", "Domestic technical GPA",
          "Domestic classified standing also requires a minimum 2.85 GPA in the last 60 semester or 90 quarter units of technical coursework.",
          adm, "A minimum grade point average of 2.85 (based on 4.0 scale) in the last 60 semester (90 quarter) units of technical course work."),
        F("requirement", "International classified admission",
          "International classified standing requires a bachelor's in Electrical, Electronics, Instrumentation, or Computer Engineering from a recognized program and an equivalent technical GPA of 3.0 or higher.",
          adm, "An equivalent grade point average of 3.0 (based on 4.0 scale) or higher in all technical course work."),
        F("requirement", "International English score",
          "Program minimum TOEFL is 85 or IELTS 6.5, which the page says is higher than the university minimum.",
          adm, "A minimum TOEFL score of 85 or minimum IELTS score of 6.5. Please note that the minimum TOEFL score required by the program is higher than the minimum required score of the university."),
        F("requirement", "GRE not required (department admissions page)",
          "Department admissions page: GRE scores are not required. The 2026–2027 catalog program page could not be fetched (AWS WAF), so a catalog GRE statement could not be compared.",
          adm, "GRE scores are not required."),
        F("requirement", "Statement of purpose not considered",
          "The Electrical Engineering program statement on this shared MSEE & MSCompE admissions page says an SOP is not required and is not used in admission decisions.",
          adm, "The Electrical Engineering program does not require a Statement of Purpose (SOP) as it is not taken into consideration with making admission decisions. Please do not send an SOP."),
        F("requirement", "Unofficial transcripts and one letter of recommendation",
          "Unofficial transcripts and one mandatory LOR are required for both MSEE and MSCompE applicants.",
          adm, "Unofficial transcripts and one mandatory LOR are required for both the MSEE and MSCompE degree applicants."),
        F("deadline", "Department page Fall 2026 application window",
          "Department admissions page: the application window for Fall 2026 is October 1, 2025 to February 1, 2026. This disagrees in cycle/year with the university master's-degrees page for Fall 2027, quoted separately; both are reported, no winner is chosen.",
          adm, "The application window for Fall 2026 will be from October 1, 2025 to February 1, 2026."),
        F("deadline", "Department Cal State Apply date for that window",
          "Department page: complete the university Cal State Apply application by February 1, 2026.",
          adm, "Complete the University Online Application via Cal State Apply – Must be completed by February 1, 2026."),
        F("deadline", "Department official documents date",
          "Department page: official test scores and transcripts must be received by February 15, 2026.",
          adm, "Send official test scores and transcripts to Graduate Admissions – Must be received by February 15, 2026."),
        F("deadline", "Scholarship consideration date",
          "Department page: applications received after January 15 will not be considered for resident tuition-waiver scholarships.",
          adm, "Applications received after JANUARY 15th will not be considered for scholarships."),
        F("deadline", "University page Fall 2027 Computer Engineering deadlines",
          "University master's-degrees page, Computer Engineering, M.S. section: Fall 2027 Cal State Apply February 1, documents to Graduate Admissions February 15, program application February 15. This is a later cycle than the department page's Fall 2026 window; both are quoted.",
          uni, "Computer Engineering, M.S."),
        F("deadline", "University Fall 2027 Cal State Apply date (CompE section)",
          "In the Computer Engineering, M.S. section of the university page: Submit Cal State Apply Application: February 1 (under Fall 2027 Deadlines).",
          uni, "Submit Cal State Apply Application : February 1"),
        F("deadline", "University Spring 2027 Computer Engineering deadlines",
          "University page CompE section lists Spring 2027 dates (Cal State Apply August 31; documents September 15; program application September 15). The department admissions page does not give these Spring 2027 dates.",
          uni, "Spring 2027 Deadlines Submit Cal State Apply Application : August 31"),
    ]
    # faculty listing names (department-wide ECE)
    listing_names = [
        "Dr. Baris Aksanli", "Dr. Amir Alimohammad", "Dr. Ashkan Ashrafi",
        "Dr. A. Ege Engin", "Dr. Ke Huang", "Dr. Tong Huang", "Dr. Sunil Kumar",
        "Dr. Saeed Manshadi", "Dr. Chris Mi", "Dr. Santosh Nagaraj",
        "Dr. Duy Nguyen", "Dr. Yusuf Ozturk", "Dr. Christopher Paolini",
        "Dr. Flavio Ponzina", "Dr. Tharm Ratnarajah", "Dr. Reza Sabzehgar",
        "Dr. Mahasweta Sarkar", "Dr. Sridhar Seshagiri", "Dr. Satish Sharma",
        "Dr. Hakan Töreyin", "Dr. Junfei Xie",
    ]
    for name in listing_names:
        facts.append(F("faculty", name,
                       "Department-wide Electrical and Computer Engineering faculty listing (not MSCompE-specific). The listing does not state a research blurb.",
                       fac, name))
    # research from handbook / profiles / guidelines
    more = [
        (hb, "Baris Aksanli", "Graduate handbook (dated 9/19/2025) lists his area as Embedded Systems. Department-wide ECE faculty.",
         "Dr. Baris Aksanli Embedded Systems"),
        (hb, "Amir Alimohammad", "Handbook lists Digital VLSI and Computational Neuroscience.",
         "Dr. Amir Alimohammad Digital VLSI"),
        ("https://electrical.sdsu.edu/people/amir-alimohammad", "Amir Alimohammad",
         "Profile specialization: Digital VLSI, computational neuroscience, neurotechnology, wireless communication.",
         "Specialization Digital VLSI Computational Neuroscience Neurotechnology Wireless Communication"),
        ("https://electrical.sdsu.edu/people/ashkan-ashrafi", "Ashkan Ashrafi",
         "Profile specialization: digital signal processing, brain signal processing, estimation theory.",
         "Specialization Digital Signal Processing Brain Signal Processing Estimation Theory"),
        ("https://electrical.sdsu.edu/people/a-ege-engin", "A. Ege Engin",
         "Profile specialization: electromagnetic interference and signal integrity.",
         "Specialization Electromagnetic Interference Signal Integrity"),
        ("https://electrical.sdsu.edu/people/ke-huang", "Ke Huang",
         "Profile specialization: VLSI, machine learning, data mining, computer-aided design.",
         "Specialization VLSI, Machine Learning Data Mining Computer Aided Design"),
        ("https://electrical.sdsu.edu/people/chris-mi", "Chris Mi",
         "Profile specialization: power electronics and electric drives, battery management systems, wireless power transfer.",
         "Specialization Power Electronics and Electric Drives Battery Management Systems Wireless Power Transfer"),
        ("https://electrical.sdsu.edu/people/flavio-ponzina", "Flavio Ponzina",
         "Profile: research interests include HW-SW co-design for edge AI, unsupervised/ensemble/distributed learning, energy-efficient systems, and processing in-memory.",
         "research interests include HW-SW co-design optimizations for edge AI, unsupervised, ensemble, and distributed learning, energy-efficient systems, and processing in-memory acceleration on emerging memory technologies."),
        (guide, "Computer Networks faculty",
         "Course-guidelines PDF lists Computer Networks faculty. Department-wide ECE areas, used here because they teach the CompE depth area.",
         "Computer Networks: Dr. Sunil Kumar, Dr. Yusuf Ozturk, Dr. Christopher Paolini, Dr. Mahasweta Sarkar, Dr. Junfei Xie"),
        (guide, "Embedded Systems faculty",
         "Course-guidelines PDF lists Embedded Systems faculty.",
         "Embedded Systems: Dr. Baris Aksanli, Dr. Yusuf Ozturk, Dr. Hakan Toreyin, Dr. Junfei Xie, Dr. Flavio Ponzina"),
        (guide, "VLSI Systems faculty",
         "Course-guidelines PDF lists VLSI Systems faculty.",
         "VLSI Systems: Dr. Amir Alimohammad, Dr. Ege Engin, Dr. Ke Huang"),
        (guide, "Machine Learning and Scientific Computing faculty",
         "Course-guidelines PDF lists Machine Learning and Scientific Computing faculty.",
         "Machine Learning and Scientific Computing: Dr. Baris Aksanli, Dr. Christopher Paolini, Dr. Junfei Xie"),
    ]
    for url, name, detail, quote in more:
        facts.append(F("faculty", name, detail, url, quote))
        if url.startswith("http") and url not in [p["url"] for p in pages] and url in FILES:
            pages.append({"kind": "faculty", "url": url})
    return {
        "schoolId": 13,
        "schoolName": "San Diego State University",
        "programName": "Computer Engineering, M.S.",
        "pages": pages,
        "facts": facts,
    }


def school14():
    ov = "https://cs.sdsu.edu/computer-science-degree-programs/"
    home = "https://cs.sdsu.edu/"
    fac = "https://cs.sdsu.edu/faculty/"
    adv = "https://cs.sdsu.edu/graduate-advising/"
    uni = "https://admissions.sdsu.edu/grad-programs/masters"
    pages = [
        {"kind": "overview", "url": ov},
        {"kind": "overview", "url": home},
        {"kind": "admissions", "url": uni},
        {"kind": "faculty", "url": fac},
        {"kind": "faculty", "url": adv},
        {"kind": "deadlines", "url": uni},
    ]
    facts = [
        F("overview", "M.S. study areas and culminating options",
          "Department degree-programs page: the M.S. includes advanced study and research in areas such as AI, machine learning, and software engineering, with a thesis project or a comprehensive exam.",
          ov, "Graduates of the Master of Science in Computer Science program at San Diego State University engage in advanced study and research in various computing domains, including artificial intelligence, machine learning, and software engineering."),
        F("requirement", "Thesis or comprehensive exam",
          "Students may complete a thesis project with faculty or a comprehensive exam.",
          ov, "Students may choose to either complete a thesis project, collaborating closely with faculty on innovative research that addresses real-world problems, or opt for a comprehensive exam to fulfill their degree requirements."),
        F("requirement", "No letters, SOP, or resumes",
          "University master's-degrees page, Computer Science, M.S. section: the department does not require or consider letters of recommendation, statements of purpose, or resumes.",
          uni, "The Computer Science Department does not require nor take into consideration letters of recommendation, statements of purpose, or resumes."),
        F("deadline", "Fall 2027 Cal State Apply",
          "Computer Science, M.S. section: Fall 2027 Cal State Apply deadline is February 1.",
          uni, "Fall 2027 Deadlines Submit Cal State Apply Application : February 1"),
        F("deadline", "Fall 2027 documents",
          "Computer Science, M.S. section: documents to Graduate Admissions are due February 15.",
          uni, "Submit Documents to Graduate Admissions : February 15"),
        F("deadline", "Spring 2027 not accepting applications",
          "Computer Science, M.S. section: the program is not currently accepting applications for spring semester.",
          uni, "Not currently accepting applications for spring semester"),
        F("faculty", "Roger Whitney",
          "Graduate Advisor, Associate Professor of Computer Science (department listing).",
          adv, "Roger Whitney, Ph.D. Graduate Advisor Associate Professor of Computer Science"),
        F("faculty", "Wei Wang",
          "Graduate Advisor, Professor of Computer Science (department listing).",
          adv, "Wei Wang, Ph.D. Graduate Advisor Professor of Computer Science"),
    ]
    listing = [
        ("Hyunjong Choi, Ph.D.", "Assistant Professor of Computer Science. Department-wide faculty listing (not M.S.-program-specific).",
         "Real-Time Embedded and Cyber-Physical Systems"),
        ("Bryan Donyanavard, Ph.D.", "Assistant Professor of Computer Science. Department-wide faculty listing (not M.S.-program-specific).",
         "Self-Aware Computing Systems, Cyber-Physical Systems Management and Optimization"),
        ("Hajar Homayouni, Ph.D.", "Assistant Professor of Computer Science. Department-wide faculty listing (not M.S.-program-specific).",
         "Data Science, Database, Applied Machine Learning, Interpretability of Machine Learning, Big Data Quality Assurance"),
        ("Xiaobai Liu, Ph.D.", "Associate Professor of Computer Science. Department-wide faculty listing (not M.S.-program-specific).",
         "Computer Vision, Machine Learning, Computational Statistics and their Applications to Clinic Diagnosis, Sports, Transportation, Surveillance, Video Games"),
        ("Hoa Vu, Ph.D.", "Assistant Professor of Computer Science. Department-wide faculty listing (not M.S.-program-specific).",
         "Theoretical Computer Science, Graph and Approximation Algorithms, Parameterized Algorithms, Sketching Algorithms"),
        ("Xin Zhang, Ph.D.", "Assistant Professor of Computer Science. Department-wide faculty listing (not M.S.-program-specific).",
         "Spatial-Temporal Data Science, Deep Learning, Imitation Learning, Meta-learning"),
        ("Shangping Ren, Ph.D.", "Department Chair, Professor of Computer Science. Department-wide faculty listing (not M.S.-program-specific).",
         "Cyber-Physical Systems, Real-Time Scheduling, Cloud Computing"),
        ("Roger Whitney, Ph.D.", "Graduate Advisor, Associate Professor. Department-wide faculty listing (not M.S.-program-specific).",
         "Object-Oriented Programming, Functional Programming, Software Development, Mobile Computing"),
        ("Wei Wang, Ph.D.", "Graduate Advisor, Professor. Department-wide faculty listing (not M.S.-program-specific).",
         "Wireless Networks, Wireless Multimedia QoE/QoS, Machine Learning in Wireless Networks"),
        ("Robert Beverly, Ph.D.", "Listed on the department faculty page (department-wide, not M.S.-program-specific).",
         "Robert Beverly, Ph.D."),
        ("Joann Qiongna Chen, Ph.D.", "Listed on the department faculty page (department-wide, not M.S.-program-specific).",
         "Joann Qiongna Chen, Ph.D."),
        ("Salimeh Sekeh, Ph.D.", "Listed on the department faculty page (department-wide, not M.S.-program-specific).",
         "Salimeh Sekeh, Ph.D."),
        ("Jianshu Liu, Ph.D.", "Listed on the department faculty page (department-wide, not M.S.-program-specific).",
         "Jianshu Liu, Ph.D."),
        ("Yifan Zhang, Ph.D.", "Listed on the department faculty page (department-wide, not M.S.-program-specific).",
         "Yifan Zhang, Ph.D."),
        ("Tao Xie, Ph.D.", "Listed on the department faculty page (department-wide, not M.S.-program-specific).",
         "Tao Xie, Ph.D."),
    ]
    for name, detail, quote in listing:
        facts.append(F("faculty", name, detail, fac, quote))

    profiles = [
        ("https://cs.sdsu.edu/people/hyunjong-choi", "Hyunjong Choi",
         "Profile is linked from the department faculty listing.",
         "Hyunjong Choi, Ph.D."),
        ("https://cs.sdsu.edu/people/bryan-donyanavard", "Bryan Donyanavard",
         "Profile is linked from the department faculty listing.",
         "Bryan Donyanavard, Ph.D."),
        ("https://cs.sdsu.edu/people/hajar-homayouni", "Hajar Homayouni",
         "Profile is linked from the department faculty listing.",
         "Hajar Homayouni, Ph.D."),
        ("https://cs.sdsu.edu/people/xiaobai-liu", "Xiaobai Liu",
         "Profile is linked from the department faculty listing.",
         "Xiaobai Liu, Ph.D."),
        ("https://cs.sdsu.edu/people/hoa-vu", "Hoa Vu",
         "Profile is linked from the department faculty listing.",
         "Hoa Vu, Ph.D."),
        ("https://cs.sdsu.edu/people/xin-zhang", "Xin Zhang",
         "Profile is linked from the department faculty listing.",
         "Xin Zhang, Ph.D."),
        ("https://cs.sdsu.edu/people/shangping-ren", "Shangping Ren",
         "Profile is linked from the department faculty listing.",
         "Shangping Ren, Ph.D."),
        ("https://cs.sdsu.edu/people/roger-whitney", "Roger Whitney",
         "Profile is linked from the department faculty listing.",
         "Roger Whitney, Ph.D."),
        ("https://cs.sdsu.edu/people/wei-wang", "Wei Wang",
         "Profile is linked from the department faculty listing.",
         "Wei Wang, Ph.D."),
        ("https://cs.sdsu.edu/people/robert-beverly/", "Robert Beverly",
         "Profile is linked from the department faculty listing.",
         "Robert Beverly, Ph.D."),
        ("https://cs.sdsu.edu/people/joann-chen/", "Joann Qiongna Chen",
         "Profile is linked from the department faculty listing.",
         "Joann Qiongna Chen, Ph.D."),
        ("https://cs.sdsu.edu/people/salimeh-sekeh/", "Salimeh Sekeh",
         "Profile is linked from the department faculty listing.",
         "Salimeh Sekeh, Ph.D."),
        ("https://cs.sdsu.edu/people/jianshu-liu/", "Jianshu Liu",
         "Profile is linked from the department faculty listing.",
         "Jianshu Liu, Ph.D."),
        ("https://cs.sdsu.edu/people/yifan-zhang/", "Yifan Zhang",
         "Profile is linked from the department faculty listing.",
         "Yifan Zhang, Ph.D."),
        ("https://cs.sdsu.edu/people/tao-xie", "Tao Xie",
         "Profile is linked from the department faculty listing.",
         "Tao Xie, Ph.D."),
    ]
    # Try to add richer research quotes from profiles if they contain listing research strings;
    # keep name quotes as a safe fallback (may be dropped later if not on profile page).
    for url, name, detail, quote in profiles:
        facts.append(F("faculty", name, detail, url, quote))
        if url not in [p["url"] for p in pages]:
            pages.append({"kind": "faculty", "url": url})

    return {
        "schoolId": 14,
        "schoolName": "San Diego State University",
        "programName": "Computer Science, M.S.",
        "pages": pages,
        "facts": facts,
    }


def school23():
    ov = "https://www.unlv.edu/degree/ms-computer-science"
    adm = "https://www.unlv.edu/cs/admissions"
    req = "https://www.unlv.edu/cs/graduate/masters"
    acd = "https://www.unlv.edu/cs/academic-programs"
    dire = "https://www.unlv.edu/cs/directory"
    dire1 = dire + "?page=1"
    dire2 = dire + "?page=2"
    hb = "https://www.unlv.edu/sites/default/files/media/document/2026-08/MS-PhD-ComputerScience-Handbook.pdf"
    th = "https://www.unlv.edu/sites/default/files/media/document/2026-07/2026-27-MS-CS-Thesis.docx"
    pr = "https://www.unlv.edu/sites/default/files/media/document/2026-07/2026-27-MS-CS-Project.docx"
    ex = "https://www.unlv.edu/sites/default/files/media/document/2026-07/2026-27-MS-CS-Exam-Foundations-Theory.docx"
    pages = [
        {"kind": "overview", "url": ov},
        {"kind": "overview", "url": acd},
        {"kind": "admissions", "url": adm},
        {"kind": "curriculum", "url": req},
        {"kind": "curriculum", "url": th},
        {"kind": "curriculum", "url": pr},
        {"kind": "curriculum", "url": ex},
        {"kind": "faculty", "url": dire},
        {"kind": "faculty", "url": dire1},
        {"kind": "faculty", "url": dire2},
        {"kind": "deadlines", "url": adm},
    ]
    facts = [
        F("overview", "Program description",
          "Official M.S. degree page: graduate programs let students study computing areas, conduct specialized research, and make original contributions.",
          ov, "Graduate degree programs in the Department of Computer Science provide students the opportunity to study different subject areas of computing science, conduct research in specialized areas, and make original contributions to the field."),
        F("overview", "Available tracks",
          "The degree page lists thesis, project, integrated BS-MS, and several exam tracks.",
          ov, "Available Options Thesis Track Project Track Integrated BS-MS Track"),
        F("overview", "Exam-track options",
          "Exam tracks named on the degree page include Foundations and Theory, Cyber Security, AI and Machine Learning, Software Engineering, Data Science and Big Data, Database and Information Retrieval, Graphics and Augmented Reality, and Programming Language and Systems.",
          ov, "Exam Track - Foundations and Theory Exam Track - Cyber Security Exam Track - AI and Machine Learning"),
        F("overview", "Study areas",
          "The degree page lists study areas including algorithms, operating and distributed systems, architecture and networking, computational geometry and robotics, graphics and image processing, programming languages, AI, databases, and software engineering.",
          ov, "Our master's program gives you the opportunity to study different areas, including: Design and analysis of algorithms."),
        F("requirement", "30-credit minimum and grade floor",
          "Department master's-requirements page: students must pass at least 30 credits of 600- and 700-level courses with a grade of C or better.",
          req, "you must pass at least 30 credits of 600- and 700-level courses with a grade of C or better"),
        F("requirement", "At least 24 credits in computer science",
          "Department requirements: at least 24 credits must be in computer science.",
          req, "At least 24 credits must be in computer science."),
        F("requirement", "700-level computer science minimum (department page)",
          "Department requirements: at least 18 credits of computer science courses must be at the 700 level. The 2026–27 plans of study also quote a Graduate College 50-percent 700-level rule; both are reported.",
          req, "At least 18 credits of computer science courses must be at the 700 level."),
        F("requirement", "Required CS 656, 660, and 677 if not already taken",
          "If equivalent courses have not been taken previously, CS 656, 660, and 677 must be included.",
          req, "If equivalent courses have not been taken previously, CS 656, 660, and 677 must be included."),
        F("requirement", "Thesis or project credit cap",
          "At most six credits of CS 791 (thesis) or three credits of CS 790 (project) can be included.",
          req, "At most, six credits of CS 791 (Thesis Option) or three credits of CS 790 (Project Option) can be included."),
        F("requirement", "3.0 GPA while in the program",
          "A GPA of 3.0 or higher must be maintained; below that, probation, then possible drop if it stays below 3.0 the next regular semester.",
          req, "A GPA of 3.0 or higher must be maintained at all times while in the program."),
        F("requirement", "2026-27 thesis subplan units",
          "2026-27 thesis plan of study (header: UNLV Graduate College 2026-2027 Catalog): 24 credits of 600- or 700-level CS courses (up to 3 credits outside CS) plus 6 credits of CS 791; minimum 30 credits.",
          th, "Complete 24 credits of 600- or 700- level Computer Science (CS) courses. Students may complete up to 3 credits outside of CS."),
        F("course", "CS 791 thesis",
          "2026-27 thesis plan lists CS 791 for the 6-credit thesis requirement.",
          th, "Thesis – Credits: 6"),
        F("requirement", "Thesis plan graduation minimum",
          "Thesis plan: minimum credits required for graduation = 30.",
          th, "Minimum credits required for graduation = 30"),
        F("requirement", "2026-27 project subplan units",
          "2026-27 project plan: 27 credits of 600- or 700-level CS courses (up to 3 outside CS) plus 3 credits of CS 790; minimum 30 credits.",
          pr, "Complete 27 credits of 600- or 700- level Computer Science (CS) courses. Students may complete up to 3 credits outside of CS."),
        F("course", "CS 790 project",
          "2026-27 project plan lists CS 790 for the 3-credit project requirement.",
          pr, "Project – Credits: 3"),
        F("requirement", "Graduate College 700-level share (plans of study)",
          "The 2026-27 plans of study state that a minimum of 50 percent of the degree program must be 700-level courses, excluding thesis, dissertation, or professional/scholarly paper. This sits beside the department page's 'at least 18 credits of computer science courses must be at the 700 level.'",
          th, "A minimum of 50 percent of the degree program must be 700-level courses excluding thesis, dissertation, or professional/scholarly paper."),
        F("course", "Exam track Foundations and Theory required list",
          "2026-27 Foundations and Theory exam plan: complete 9 credits from CS 656, CS 677, CS 715, CS 758, and CS 789, plus 21 credits of other 600- or 700-level CS courses.",
          ex, "Required Courses - Credits: 9"),
        F("course", "CS 656 on the Foundations exam list",
          "The Foundations and Theory plan lists CS 656 among the required-course options.",
          ex, "CS 656"),
        F("course", "CS 677 on the Foundations exam list",
          "The Foundations and Theory plan lists CS 677 among the required-course options.",
          ex, "CS 677"),
        F("course", "CS 715 on the Foundations exam list",
          "The Foundations and Theory plan lists CS 715 among the required-course options.",
          ex, "CS 715"),
        F("requirement", "Letters of recommendation (M.S.)",
          "Department admissions page, Master of Science in Computer Science section: submit two letters of recommendation.",
          adm, "Two letters of recommendation concerning your potential for success in the graduate program."),
        F("requirement", "M.S. GPA minimum",
          "M.S. admissions: a minimal GPA of 2.75 overall or 3.0 on the last two years of undergraduate work.",
          adm, "A minimal grade point average (GPA) of 2.75 overall or 3.0 on the last two years of undergraduate work."),
        F("requirement", "Background courses at grade B",
          "Evidence that courses equivalent to the department's basic undergraduate courses have been completed with an average grade of B or better.",
          adm, "Evidence that courses equivalent to our basic undergraduate courses have been completed with an average grade of B or better."),
        F("requirement", "Bachelor's degree and transcript",
          "Evidence of a bachelor's degree from an accredited four-year college or university, with an official transcript.",
          adm, "Evidence that a bachelor's degree in some field has been earned from an accredited four-year college or university, with an official transcript."),
        F("requirement", "GRE results required (department admissions page)",
          "The M.S. section requires results of the Graduate Record Examination. The 2026–2027 catalog program page could not be fetched (AWS WAF), so catalog wording could not be compared.",
          adm, "Results of the Graduate Record Examination."),
        F("deadline", "Fall and Spring material deadlines",
          "Department admissions page: the deadline for receiving all materials is August 1 (Fall) and December 1 (Spring). Graduate assistantship materials may need to arrive earlier.",
          adm, "The deadline for receiving all materials is August 1 (for Fall) and December 1 (for Spring) admission."),
        F("overview", "Expected master's timeline (handbook)",
          "The August 2026-posted handbook says a master's is expected to take two years. The handbook's revision table still lists a March 2020 last revision.",
          hb, "In Computer Science, it is expected to take two years for the Master degree and four to six years for the Ph.D. degree."),
    ]
    listing = [
        (dire, "Shaikh Arifuzzaman, Ph.D.", "Assistant Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Shaikh Arifuzzaman, Ph.D."),
        (dire, "Wolfgang Bein, Ph.D.", "Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Wolfgang Bein, Ph.D."),
        (dire, "Hal Berghel, Ph.D.", "Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Hal Berghel, Ph.D."),
        (dire, "John Businge, Ph.D.", "Assistant Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "John Businge, Ph.D."),
        (dire1, "Jorge Fonseca Cacho, Ph.D.", "Assistant Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Jorge Fonseca Cacho, Ph.D."),
        (dire1, "Laxmi Gewali, Ph.D.", "Chair, Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Laxmi Gewali, Ph.D."),
        (dire1, "Ju-Yeon Jo, Ph.D.", "Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Ju-Yeon Jo, Ph.D."),
        (dire1, "Mingon Kang, Ph.D.", "Associate Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Mingon Kang, Ph.D."),
        (dire1, "Yoohwan Kim, Ph.D.", "Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Yoohwan Kim, Ph.D."),
        (dire1, "Lawrence Larmore, Ph.D.", "Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Lawrence Larmore, Ph.D."),
        (dire1, "John Minor", "Associate Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "John Minor"),
        (dire1, "Prashant Modekurthy, Ph.D.", "Assistant Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Prashant Modekurthy, Ph.D."),
        (dire1, "Fatma Nasoz, Ph.D.", "Associate Professor and graduate coordinator. Department faculty/staff directory (not M.S.-program-specific).",
         "Fatma Nasoz, Ph.D."),
        (dire2, "Jan \"Matt\" Pedersen", "Associate Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Jan \"Matt\" Pedersen"),
        (dire2, "Bryar Shareef, Ph.D.", "Assistant Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Bryar Shareef, Ph.D."),
        (dire2, "Junggab Son, Ph.D.", "Assistant Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Junggab Son, Ph.D."),
        (dire2, "Andreas Stefik, Ph.D.", "Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Andreas Stefik, Ph.D."),
        (dire2, "Kazem Taghva", "Data Analytics Chair, Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Kazem Taghva"),
        (dire2, "Chuck Tessler, Ph.D.", "Assistant Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Chuck Tessler, Ph.D."),
        (dire2, "Zuobin Xiong, Ph.D.", "Assistant Professor. Department faculty/staff directory (not M.S.-program-specific).",
         "Zuobin Xiong, Ph.D."),
    ]
    for url, name, detail, quote in listing:
        facts.append(F("faculty", name, detail, url, quote))

    profiles = [
        ("https://www.unlv.edu/people/fatma-nasoz", "Fatma Nasoz",
         "Profile: research interests include machine learning and deep learning, with work on health, education, finance, and genomics data.",
         "research interests include machine learning and deep learning, with a focus on analyzing primary and secondary data across health, education, finance, and genomics."),
        ("https://www.unlv.edu/people/zuobin-xiong", "Zuobin Xiong",
         "Profile: research interests in cybersecurity and privacy, including privacy-preserving machine learning and data mining, IoT, and data security.",
         "research interests lie in a broad area of cybersecurity and privacy, including privacy-preserving machine learning, privacy-preserving data mining, the Internet of Things (IoT), and data security related topics."),
        ("https://www.unlv.edu/people/shaikh-arifuzzaman", "Shaikh Arifuzzaman",
         "Profile is linked from the department directory.",
         "Shaikh Arifuzzaman, Ph.D."),
        ("https://www.unlv.edu/people/wolfgang-bein", "Wolfgang Bein",
         "Profile is linked from the department directory.",
         "Wolfgang Bein, Ph.D."),
        ("https://www.unlv.edu/people/hal-berghel", "Hal Berghel",
         "Profile is linked from the department directory.",
         "Hal Berghel, Ph.D."),
        ("https://www.unlv.edu/people/john-businge", "John Businge",
         "Profile is linked from the department directory.",
         "John Businge, Ph.D."),
        ("https://www.unlv.edu/people/jorge-fonseca-cacho", "Jorge Fonseca Cacho",
         "Profile is linked from the department directory.",
         "Jorge Fonseca Cacho, Ph.D."),
        ("https://www.unlv.edu/people/laxmi-gewali", "Laxmi Gewali",
         "Profile is linked from the department directory.",
         "Laxmi Gewali, Ph.D."),
        ("https://www.unlv.edu/people/ju-yeon-jo", "Ju-Yeon Jo",
         "Profile is linked from the department directory.",
         "Ju-Yeon Jo, Ph.D."),
        ("https://www.unlv.edu/people/mingon-kang", "Mingon Kang",
         "Profile is linked from the department directory.",
         "Mingon Kang, Ph.D."),
        ("https://www.unlv.edu/people/yoohwan-kim", "Yoohwan Kim",
         "Profile is linked from the department directory.",
         "Yoohwan Kim, Ph.D."),
        ("https://www.unlv.edu/people/lawrence-larmore", "Lawrence Larmore",
         "Profile is linked from the department directory.",
         "Lawrence Larmore, Ph.D."),
        ("https://www.unlv.edu/people/prashant-modekurthy", "Prashant Modekurthy",
         "Profile is linked from the department directory.",
         "Prashant Modekurthy, Ph.D."),
        ("https://www.unlv.edu/people/andreas-stefik", "Andreas Stefik",
         "Profile is linked from the department directory.",
         "Andreas Stefik, Ph.D."),
        ("https://www.unlv.edu/people/john-minor", "John Minor",
         "Profile is linked from the department directory.",
         "John Minor"),
    ]
    for url, name, detail, quote in profiles:
        facts.append(F("faculty", name, detail, url, quote))
        if url not in [p["url"] for p in pages]:
            pages.append({"kind": "faculty", "url": url})

    return {
        "schoolId": 23,
        "schoolName": "University of Nevada, Las Vegas",
        "programName": "Computer Science, M.S.",
        "pages": pages,
        "facts": facts,
    }


def assign_ids(facts):
    out = []
    for i, f in enumerate(facts, 1):
        item = {"id": f"f{i}", **f}
        out.append(item)
    return out


def check_school(school):
    checks = []
    kept = []
    errors = []
    for fact in school["facts"]:
        url = fact["sourceUrl"]
        rec = {
            "id": fact.get("id"),
            "sourceUrl": url,
            "quote": fact["quote"],
            "len": len(fact["quote"]),
        }
        try:
            page = norm_for(url)
        except Exception as e:
            rec.update({"ok": False, "reason": f"source error: {e}"})
            checks.append(rec)
            errors.append(str(e))
            continue
        ok, reason = quote_ok(page, fact["quote"])
        rec.update({"ok": ok, "reason": reason})
        checks.append(rec)
        if ok:
            kept.append(fact)
    return kept, checks, errors


def main():
    results = []
    for school in build_schools():
        school["facts"] = assign_ids(school["facts"])
        kept, checks, errors = check_school(school)
        # re-id after drops
        kept = assign_ids([{k: v for k, v in f.items() if k != "id"} for f in kept])
        for i, c in enumerate(checks, 1):
            # keep original ids in the check file
            pass
        out = {
            "schoolId": school["schoolId"],
            "schoolName": school["schoolName"],
            "programName": school["programName"],
            "pages": school["pages"],
            "facts": kept,
        }
        path = ROOT / "research" / f"school-{school['schoolId']}.json"
        path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
        passed = sum(1 for c in checks if c["ok"])
        failed = sum(1 for c in checks if not c["ok"])
        report = {
            "schoolId": school["schoolId"],
            "tier": "primary_live_only",
            "accessed": ACCESSED,
            "pass": passed,
            "fail": failed,
            "errors": errors,
            "checks": checks,
        }
        (ROOT / "checks" / f"school-{school['schoolId']}.quote-check.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n"
        )
        fails = [c for c in checks if not c["ok"]]
        results.append((school["schoolId"], passed, failed, fails, len(kept), len(out["pages"])))
        print(f"school {school['schoolId']}: attempted {len(checks)} pass {passed} fail {failed} kept {len(kept)} pages {len(out['pages'])}")
        for c in fails:
            print(f"  FAIL {c['id']}: {c['reason']} :: {c['quote'][:140]!r}")
            # show a nearby needle
            try:
                page = norm_for(c["sourceUrl"])
                words = normalize_text(c["quote"]).split()
                needle = " ".join(words[:6]) if words else ""
                i = page.lower().find(needle.lower()) if needle else -1
                if i >= 0:
                    print("    context:", page[max(0, i-40):i+180])
            except Exception as e:
                print("    no context", e)
    return results

