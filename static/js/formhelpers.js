
function repeatPassword(pwfield, pwrfield, pwrgrp, error, btn)
{
    pwrfield.keyup(function ()
        {
            if(pwrfield.val() != pwfield.val() && pwrfield.val().length != 0)
            {
                pwrgrp.addClass('error');
                error.show();
                $('#register-submit').attr('disabled', 'disabled');
            }
            else
            {
                pwrgrp.removeClass('error');
                error.hide();
                if(pwrfield.val().length != 0)
                    btn.removeAttr('disabled');
            }
        });
}
