// Package v1alpha1 contains experimental alpha API types for the widget resource.
package v1alpha1

// TypeMeta describes an individual object with an API version and a kind.
type TypeMeta struct {
	Kind       string `json:"kind,omitempty"`
	APIVersion string `json:"apiVersion,omitempty"`
}

// ObjectMeta is metadata that all persisted resources must have.
type ObjectMeta struct {
	Name      string `json:"name,omitempty"`
	Namespace string `json:"namespace,omitempty"`
}

// AlphaWidget is an experimental widget resource.
type AlphaWidget struct {
	TypeMeta   `json:",inline"`
	ObjectMeta `json:"metadata,omitempty"`

	// Spec defines the desired state of the AlphaWidget.
	Spec AlphaWidgetSpec `json:"spec,omitempty"`
}

// AlphaWidgetSpec defines the desired state of an AlphaWidget.
type AlphaWidgetSpec struct {
	// Mode is the experimental operational mode.
	Mode string `json:"mode,omitempty"`
}
