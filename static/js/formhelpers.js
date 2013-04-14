
function repeatPassword(pwfield, pwrfield, pwrgrp, error, btn)
{
    var changeHandler = function ()
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
        };

    pwrfield.change(changeHandler).keyup(changeHandler);
}
