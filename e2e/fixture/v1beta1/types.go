// Package v1beta1 contains beta API types for the widget resource.
package v1beta1

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

// BetaWidget is a beta-stability widget resource.
type BetaWidget struct {
	TypeMeta   `json:",inline"`
	ObjectMeta `json:"metadata,omitempty"`

	// Spec defines the desired state of the BetaWidget.
	Spec BetaWidgetSpec `json:"spec,omitempty"`
}

// BetaWidgetSpec defines the desired state of a BetaWidget.
type BetaWidgetSpec struct {
	// Strategy is the beta rollout strategy.
	Strategy string `json:"strategy,omitempty"`
}
