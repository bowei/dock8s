// Package v1 contains API types for the widget resource.
package v1

// TypeMeta describes an individual object with an API version and a kind.
type TypeMeta struct {
	// Kind is a string value representing the REST resource this object represents.
	Kind string `json:"kind,omitempty"`

	// APIVersion defines the versioned schema of this representation of an object.
	APIVersion string `json:"apiVersion,omitempty"`
}

// ObjectMeta is metadata that all persisted resources must have.
type ObjectMeta struct {
	// Name must be unique within a namespace.
	Name string `json:"name,omitempty"`

	// Namespace defines the space within which each name must be unique.
	Namespace string `json:"namespace,omitempty"`

	// Labels are key/value pairs attached to objects.
	Labels map[string]string `json:"labels,omitempty"`
}

// Widget is a sample configurable resource.
//
// Widgets can be used to represent configurable items in the system.
type Widget struct {
	TypeMeta   `json:",inline"`
	ObjectMeta `json:"metadata,omitempty"`

	// Spec defines the desired state of the Widget.
	Spec WidgetSpec `json:"spec,omitempty"`

	// Status holds the last observed state of the Widget.
	Status WidgetStatus `json:"status,omitempty"`
}

// WidgetList contains a list of Widget resources.
type WidgetList struct {
	TypeMeta   `json:",inline"`
	ObjectMeta `json:"metadata,omitempty"`

	// Items is the list of Widget objects.
	Items []Widget `json:"items"`
}

// WidgetSpec defines the desired state of a Widget.
type WidgetSpec struct {
	// Replicas is the number of widget instances to run.
	//
	// Defaults to 1 if not specified.
	Replicas *int32 `json:"replicas,omitempty"`

	// Color is the primary display color of the widget.
	//
	// Must be a valid CSS color value such as "red" or "#ff0000".
	Color string `json:"color,omitempty"`

	// Tags are optional string labels for the widget.
	//
	// Deprecated: Use Labels on ObjectMeta instead.
	Tags []string `json:"tags,omitempty"`

	// Config holds additional key-value configuration parameters.
	Config map[string]string `json:"config,omitempty"`
}

// WidgetStatus holds the observed state of a Widget.
type WidgetStatus struct {
	// Phase is the current lifecycle phase of the Widget.
	Phase Phase `json:"phase,omitempty"`

	// Message is a human-readable description of the current status.
	Message string `json:"message,omitempty"`
}

// Phase is the lifecycle phase of a Widget resource.
type Phase string

const (
	// PhasePending means the Widget has been accepted but is not yet running.
	PhasePending Phase = "Pending"

	// PhaseRunning means the Widget is currently active and running.
	PhaseRunning Phase = "Running"

	// PhaseFailed means the Widget terminated with an error.
	PhaseFailed Phase = "Failed"
)
