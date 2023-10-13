<div component="topic/endorse/container" class="btn-group action-bar bottom-sheet <!-- IF !privileges.topics:reply -->hidden<!-- ENDIF !privileges.topics:reply -->">
    <button id = "endorse-button" class="btn btn-sm btn-primary" component="topic/endorse" type="submit" data-ajaxify="false" role="button"><i class="fa fa-reply visible-xs-inline"></i><span class="visible-sm-inline visible-md-inline visible-lg-inline"> [[topic:Endorse]]</span></button>
</div>

<style>
#Need to fix the privileges for only instructors so they can only endorse.
</style>

<!-- IF loggedIn -->
<!-- IF !privileges.topics:endorse -->
<!-- IF locked -->
<!-- ENDIF locked -->
<!-- ENDIF !privileges.topics:endorse -->

<!-- IF !locked -->
<!-- ENDIF !locked -->

<!-- ELSE -->

<!-- IF !privileges.topics:endorse -->
<!-- ENDIF !privileges.topics:endorse -->
<!-- ENDIF loggedIn -->