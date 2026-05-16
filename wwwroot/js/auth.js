$(document).ready(function () {
    // Handle Login
    $("#loginForm").submit(function (e) {
        e.preventDefault();
        
        const username = $("#username").val();
        const password = $("#password").val();
        
        const data = {
            username: username,
            password: password
        };

        $.ajax({
            url: CONFIG.API_BASE_URL + "/Auth/login",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify(data),
            success: function (response) {
                // response structure based on ApiResponse<object>
                // e.g. { statusCode: 200, success: true, message: "...", data: { token: "..." } }
                const token = response.data ? response.data.token : response.token;
                localStorage.setItem("zentrackToken", token);
                window.location.href = "/Index";
            },
            error: function (xhr) {
                let errorMessage = "Login failed. Please check your credentials.";
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                }
                $("#loginAlert").removeClass("d-none").text(errorMessage);
            }
        });
    });

    // Handle Registration
    $("#registerForm").submit(function (e) {
        e.preventDefault();
        
        const username = $("#regUsername").val();
        const password = $("#regPassword").val();
        
        const data = {
            username: username,
            password: password
        };

        $.ajax({
            url: CONFIG.API_BASE_URL + "/Auth/register",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify(data),
            success: function (response) {
                $("#registerAlert").addClass("d-none");
                $("#registerSuccess").removeClass("d-none").text("Registration successful! You can now log in.");
                
                // Clear form
                $("#regUsername").val('');
                $("#regPassword").val('');
                
                // Optional: redirect to login after a delay
                setTimeout(function() {
                    window.location.href = "/Auth/Login";
                }, 2000);
            },
            error: function (xhr) {
                $("#registerSuccess").addClass("d-none");
                let errorMessage = "Registration failed.";
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMessage = xhr.responseJSON.message;
                }
                $("#registerAlert").removeClass("d-none").text(errorMessage);
            }
        });
    });
});
