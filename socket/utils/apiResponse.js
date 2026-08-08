/**
 * Standard API Response class
 * Creates consistent response structure across all endpoints
 */

class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode;
    this.success = statusCode >= 200 && statusCode < 300;
    this.message = message;
    this.data = data;
    this.timestamp = new Date();
  }
}

module.exports = { ApiResponse };