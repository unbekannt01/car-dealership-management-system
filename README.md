## Car Dealership Management System

### Description

The Car Dealership Management System is a comprehensive web application designed to streamline the processes involved in managing a car dealership. The project is divided into two main services: MS1 and MS2.

### Project Structure

- **MS1: Car Management Service**
  - Handles all car-related functionalities including booking test drives, buying, and selling cars.
  - Built with NestJS for backend operations, TypeScript for robust type-checking, and MySQL for database management.
  - Utilizes RESTful API design principles to integrate seamlessly with the frontend.
  - Features secure user notifications via email using NodeMailer.

- **MS2: User Authentication Service**
  - Manages user authentication, including login and registration functionalities.
  - Ensures secure user management with token-based authentication.
  - Facilitates communication between services using microservices architecture and RabbitMQ.

### Technologies Used

- **Frontend:** HTML, CSS, JavaScript, React JS, Bootstrap
- **Backend:** NestJS, TypeScript, MySQL, NodeMailer
- **APIs:** RESTful API design
- **Tools:** Swagger, Postman

### Installation

1. Clone the repository
2. Navigate to the respective service directories (`ms1` and `ms2`)
3. Install dependencies using `npm install`
4. Run the services using `npm start`

### Features

- **MS1:**
  - Book and manage test drives
  - Buy and sell cars
  - User notifications via email

- **MS2:**
  - User login and registration
  - Secure token-based authentication
